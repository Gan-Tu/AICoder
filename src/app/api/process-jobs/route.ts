import { NextResponse } from "next/server";

export async function POST() {
  try {
    const functionUrl = process.env.GCP_PROCESS_JOBS_URL;
    if (!functionUrl) {
      throw new Error('GCP_PROCESS_JOBS_URL not configured');
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to process jobs');
    }

    return NextResponse.json(await response.json());
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
} 