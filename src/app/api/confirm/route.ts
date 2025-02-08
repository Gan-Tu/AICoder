import { neon } from '@neondatabase/serverless';
import { NextResponse } from "next/server";

// The NEON_DATABASE_URL env variable must be defined.
const sql = neon(`${process.env.DATABASE_URL}`);

export async function POST(request: Request) {
  try {
    const { prompt, clarification, clarificationQuestion } = await request.json();

    // Use Node's crypto.randomUUID if available or fallback
    const jobId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString();
    const functionName = "gcf_function_" + Math.random().toString(36).substring(2, 9);

    // Insert a new job record.
    const query = `
      INSERT INTO AiCoderDeployJobs (id, prompt, clarification, function_name, status)
      VALUES ($1, $2, $3, $4, 'pending')
    `;
    await sql(query, [jobId, prompt, `Clarifications Questions: ${clarificationQuestion} \n Answers: ${clarification}`, functionName]);

    // Trigger processing asynchronously
    fetch(process.env.GCP_PROCESS_JOBS_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).catch(console.error); // Handle error but don't wait

    return NextResponse.json({ jobId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
