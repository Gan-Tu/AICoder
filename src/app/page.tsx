"use client";

import { useState } from "react";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const [userPrompt, setUserPrompt] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [output, setOutput] = useState("");
  const [inputs, setInputs] = useState<string[]>([]);
  const [userInputs, setUserInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setGeneratedCode("");
    setOutput("");

    try {
      const response = await fetch("/api/execute-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ userPrompt })
      });

      const data = await response.json();

      if (data.success) {
        setGeneratedCode(data.generatedCode);
        setInputs([]);
        setOutput(data.output || data.stdout || data.stderr);
      } else {
        setError(data.error || "Failed to execute script.");
      }
    } catch (err) {
      console.error(err);
      setError("An error occurred while executing the script.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (key: string, value: string) => {
    setUserInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleExecution = async () => {
    setLoading(true);
    setError("");
    setOutput("");

    try {
      const response = await fetch("/api/execute-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ userPrompt, inputs: userInputs })
      });

      const data = await response.json();

      if (data.success) {
        setOutput(data.output);
      } else {
        setError(data.error || "Failed to execute script.");
      }
    } catch (err) {
      console.error(err);
      setError("An error occurred while executing the script.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white p-6 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">
          AI Coder (Python)
        </h1>

        {/* --- Generate Script Form --- */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="Describe the script you want to execute..."
            className="w-full p-4 border rounded-lg shadow-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition"
            disabled={loading}
          >
            {loading ? "Processing..." : "Generate Script"}
          </button>
        </form>

        {error && <span className="text-red-500 mt-4">{error}</span>}

        {/* --- If Script Generated & Requires Additional Inputs --- */}
        {inputs.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Required Inputs
            </h2>
            <form className="space-y-4">
              {inputs.map((input) => (
                <div key={input}>
                  <label className="block text-gray-600 font-medium">
                    {input}
                  </label>
                  <input
                    type="text"
                    onChange={(e) => handleInputChange(input, e.target.value)}
                    className="w-full p-3 border rounded-lg shadow-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={handleExecution}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition"
              >
                {loading ? "Executing..." : "Execute Script"}
              </button>
            </form>
          </div>
        )}

        {/* --- Show Generated Code --- */}
        {generatedCode && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Generated Code
            </h2>
            <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
              {generatedCode}
            </pre>
          </div>
        )}

        {/* --- Show Execution Output --- */}
        {output && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Execution Output
            </h2>
            <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
              {output}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
