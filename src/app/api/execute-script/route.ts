import { Sandbox } from '@e2b/code-interpreter';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(request: NextRequest) {
  try {
    const { userPrompt } = await request.json();

    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant that can execute python code in a Jupyter notebook. Only respond with the code to be executed and nothing else. Strip backticks in code blocks. **IMPORTANT**: if any python packages imported do not come with python shell by default, list each package name on its own in the `packages` output format." },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      response_format: zodResponseFormat(z.object({
        packages: z.array(z.string()).describe("A list of python packages that are needed by import but don't come with Python by default. We will install these using pip install. Leave empty if no new packages are needed."),
        code: z.string().describe("The code snippet to execute in python shell."),
      }), "script"),
    });


    const script = completion.choices[0].message.parsed;
    if (!script || !script.code) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate script.' },
        { status: 404 }
      );
    }

    const sandbox = await Sandbox.create()
    if (script.packages) {
      for (const pkg of script.packages) {
        sandbox.commands.run(`pip install ${pkg}`)
      }
    }
    const execution = await sandbox.runCode(script.code, { language: "python" })
    await sandbox.kill();

    return NextResponse.json({
      success: true,
      packages: script.packages || [],
      generatedCode: script.code,
      stdout: execution.logs.stdout.join('\n'),
      stderr: execution.logs.stderr.join('\n'),
      output: execution.text
    });
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { success: false, error: 'Failed to execute script.' },
      { status: 500 }
    );
  }
}