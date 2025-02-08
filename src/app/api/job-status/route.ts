import { neon } from '@neondatabase/serverless';
import { NextResponse } from "next/server";
const sql = neon(`${process.env.DATABASE_URL}`);

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const result = await sql(
      "SELECT status, deployed_url, error FROM AiCoderDeployJobs WHERE id = $1",
      [jobId]
    );
    if (result.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const job = result[0];
    const statusMessages: Record<JobStatus, string> = {
      pending: "Waiting to start...",
      processing: "Generating and deploying your API...",
      completed: "API deployment successful!",
      failed: "Deployment failed"
    };

    if (job.status === "completed") {
      return NextResponse.json({
        status: statusMessages[job.status as JobStatus],
        deployedURL: job.deployed_url
      });
    } else if (job.status === "failed") {
      return NextResponse.json({
        status: statusMessages[job.status as JobStatus],
        error: job.error
      });
    } else {
      return NextResponse.json({
        status: statusMessages[job.status as JobStatus] || job.status
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}