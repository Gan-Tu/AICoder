import { Sandbox } from '@e2b/code-interpreter';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(request: NextRequest) {
  try {
    const { userPrompt } = await request.json();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant that can execute python code in a Jupyter notebook. Only respond with the code to be executed and nothing else. Strip backticks in code blocks. Do not use packages that don't come with python by default" },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const generatedCode = completion.choices[0].message.content;

    if (!generatedCode) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate code.' },
        { status: 404 }
      );
    }


    const sandbox = await Sandbox.create()
    const execution = await sandbox.runCode(generatedCode, { language: "python" })
    await sandbox.kill();

    return NextResponse.json({
      success: true,
      generatedCode,
      output: execution.text || execution.logs.stdout.join('\n') || execution.logs.stderr.join('\n'),
    });
  } catch (error) {
    console.error('Error executing script:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to execute script.' },
      { status: 500 }
    );
  }
}