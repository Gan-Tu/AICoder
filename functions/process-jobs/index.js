import { neon } from "@neondatabase/serverless";
import { google } from "googleapis";
import JSZip from "jszip";
import { OpenAI } from "openai";

// Create neon SQL client
const sql = neon(process.env.DATABASE_URL);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function deployToGCF(functionName, zipBuffer) {
  // Authenticate with Google Cloud
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"]
  });
  const authClient = await auth.getClient();
  const cloudfunctions = google.cloudfunctions("v1");

  // Set auth globally
  cloudfunctions.context._options = { auth: authClient };

  const parent = `projects/${process.env.GCP_PROJECT_ID}/locations/${process.env.GCP_LOCATION}`;

  // Request an upload URL for the function code.
  const generateRes =
    await cloudfunctions.projects.locations.functions.generateUploadUrl({
      parent: parent
    });
  const uploadUrl = generateRes.data.uploadUrl;
  if (!uploadUrl) throw new Error("Failed to generate upload URL");

  // Upload the zip file to the provided URL.
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/zip",
      // Add additional headers that GCP expects
      "x-goog-content-length-range": "0,104857600"
    },
    body: zipBuffer
  });

  if (!uploadResponse.ok) {
    // Log more details about the error
    const errorText = await uploadResponse.text();
    console.error("Upload failed with status:", uploadResponse.status);
    console.error("Error details:", errorText);
    throw new Error(
      `Failed to upload function zip: ${uploadResponse.status} ${errorText}`
    );
  }

  const functionFullName = `${parent}/functions/${functionName}`;
  const functionBody = {
    name: functionFullName,
    entryPoint: "handler",
    runtime: "python312",
    httpsTrigger: {
      securityLevel: "SECURE_OPTIONAL"
    },
    sourceUploadUrl: uploadUrl,
    timeout: "120s",
    ingressSettings: "ALLOW_ALL" // Make function publicly accessible
  };

  const createRes = await cloudfunctions.projects.locations.functions.create({
    location: parent,
    requestBody: functionBody
  });
  if (!createRes.data.name)
    throw new Error("Failed to initiate cloud function creation");

  console.log("GCF creation initiated:", createRes.data.name);

  // Poll for completion with exponential backoff
  let retries = 0;
  const maxRetries = 20; // Increased from 1 to 20
  const maxWaitTime = 300000; // 5 minutes in milliseconds

  while (retries < maxRetries) {
    const waitTime = Math.min(Math.pow(2, retries) * 1000, maxWaitTime);
    await new Promise((resolve) => setTimeout(resolve, waitTime));

    const getRes = await cloudfunctions.projects.locations.functions.get({
      name: functionFullName
    });

    console.log(
      `Deployment status (${retries + 1}/${maxRetries}):`,
      getRes.data.status
    );

    if (getRes.data.status === "ACTIVE") {
      const deployedURL = getRes.data.httpsTrigger?.url;
      if (!deployedURL) throw new Error("Deployment did not return a URL");
      await cloudfunctions.projects.locations.functions.setIamPolicy({
        resource: functionFullName,
        requestBody: {
          policy: {
            bindings: [
              {
                role: "roles/cloudfunctions.invoker",
                members: ["allUsers"]
              }
            ]
          }
        }
      });
      return deployedURL;
    }

    if (getRes.data.status === "FAILED") {
      try {
        await cloudfunctions.projects.locations.functions.delete({
          name: functionFullName
        });
        console.log("Deleted failed function deployment");
      } catch (deleteError) {
        console.error("Error deleting failed function:", deleteError);
      }
      throw new Error(
        `Deployment failed: ${getRes.data.buildErrorMessage || "Unknown error"}`
      );
    }

    retries++;
  }

  try {
    await cloudfunctions.projects.locations.functions.delete({
      name: functionFullName
    });
    console.log("Deleted timed out function deployment");
  } catch (deleteError) {
    console.error("Error deleting failed function:", deleteError);
  }

  throw new Error("Function deployment timed out after 5 minutes");
}

async function processNextJob() {
  let jobId;
  try {
    // Select and lock one pending job
    const jobs = await sql`
      UPDATE AiCoderDeployJobs
      SET status = 'processing',
          updated_at = NOW()
      WHERE id = (
        SELECT id 
        FROM AiCoderDeployJobs 
        WHERE status = 'pending'
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
    `;

    if (jobs.length === 0) {
      console.log("No pending jobs found");
      return;
    }

    const job = jobs[0];
    jobId = job.id;
    // Generate the Python code and requirements
    const combinedPrompt = `Generate production-ready Python serverless function code using Google Cloud Functions Framework with a function named "handler" and a requirements.txt file. Do not include triple quotes or language tags. Format the response as:

    REQUIREMENTS:
    functions-framework==3.*
    <requirements file contents>

    CODE:
    import functions_framework
    import logging

    # Configure logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)

    @functions_framework.http
    def handler(request):
        <function code>

    Requirements:
    Prompt: ${job.prompt}
    Clarifications: ${job.clarification}
    Include robust error handling and logging. The function should accept a functions-framework HTTP request and return a functions-framework compatible response.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: combinedPrompt }],
      temperature: 0.2
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error("No response was generated by OpenAI");

    // Parse requirements and code from response
    const reqMatch = response.match(/REQUIREMENTS:\n([\s\S]*?)\n\nCODE:/);
    const codeMatch = response.match(/CODE:\n([\s\S]*)/);

    if (!reqMatch || !codeMatch) {
      throw new Error("Could not parse requirements and code from response");
    }

    const requirementsTxt = reqMatch[1].trim();
    const generatedCode = codeMatch[1].trim();

    console.log("Generated code:", generatedCode);
    console.log("Requirements:", requirementsTxt);

    const zip = new JSZip();
    zip.file("main.py", generatedCode);
    zip.file("requirements.txt", requirementsTxt);
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    const deployedURL = await deployToGCF(job.function_name, zipBuffer);

    await sql`
      UPDATE AiCoderDeployJobs 
      SET status = 'completed', 
          deployed_url = ${deployedURL}, 
          updated_at = NOW() 
      WHERE id = ${job.id}
    `;
  } catch (error) {
    if (jobId) {
      await sql`
        UPDATE AiCoderDeployJobs
        SET status = 'failed',
            error = ${error.message},
            updated_at = NOW()
        WHERE id = ${jobId}
      `;
    }
    throw error;
  }
}

export const handler = async (req, res) => {
  try {
    await processNextJob();
    res.json({ status: "success" });
  } catch (error) {
    console.error("Error processing job:", error);
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
};
