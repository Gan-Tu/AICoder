import { NextResponse } from "next/server";
import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Use OpenAI to analyze the prompt and generate clarifying questions
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert code reviewer helping to clarify requirements before code generation. Analyze the prompt and return 1-3 key clarifying questions that would help generate better code. Focus on edge cases, and feature polish, and implementation details. Return an empty string if the prompt is already clear. Make reasonable assumptions about the user's intent without asking clarifications, if possible."
        },
        {
          role: "user",
          content: `Please analyze this code generation prompt and suggest clarifying questions: ${prompt}`
        }
      ],
      temperature: 0.7,
    });

    const clarificationQuestion = completion.choices[0]?.message?.content || "";

    // If no clarification needed, return empty
    if (!clarificationQuestion || clarificationQuestion.toLowerCase().includes("no clarification needed")) {
      return NextResponse.json({});
    }

    return NextResponse.json({ clarificationQuestion });

  } catch (error: any) {
    console.error("Error in clarification endpoint:", error);
    return NextResponse.json(
      { error: "Failed to process clarification request" },
      { status: 500 }
    );
  }
}
