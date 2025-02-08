"use client";

import { FormEvent, useState } from "react";

export default function HomePage() {
  const [prompt, setPrompt] = useState<string>("");
  const [clarification, setClarification] = useState<string>("");
  const [clarificationQuestion, setClarificationQuestion] =
    useState<string>("");
  const [generatedURL, setGeneratedURL] = useState<string>("");
  const [step, setStep] = useState<
    "input" | "clarify" | "submitted" | "confirm"
  >("input");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [jobStatus, setJobStatus] = useState<string>("");

  // First, get clarification (if needed)
  const handleGetClarification = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.clarificationQuestion) {
        setClarificationQuestion(data.clarificationQuestion);
        setStep("clarify");
      } else {
        setStep("confirm");
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  // Confirm the prompt and enqueued job; then poll for status.
  const handleConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setJobStatus("Submitting request...");

    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, clarificationQuestion, clarification })
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setLoading(false);
      } else if (data.jobId) {
        // Start polling immediately
        pollJobStatus(data.jobId);
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    try {
      const statusRes = await fetch(`/api/job-status?jobId=${jobId}`);
      const statusData = await statusRes.json();

      if (statusData.error) {
        setError(statusData.error);
        setLoading(false);
        return;
      }

      if (statusData.status) {
        setJobStatus(statusData.status);
      }

      if (statusData.deployedURL) {
        setGeneratedURL(statusData.deployedURL);
        setStep("submitted");
        setLoading(false);
      } else {
        // Continue polling if not completed
        setTimeout(() => pollJobStatus(jobId), 5000);
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white shadow-lg rounded-lg p-6">
        {error && (
          <div className="mb-4 text-red-600 text-center font-bold">
            Error: {error}
          </div>
        )}

        {/* Always show the prompt if it exists */}
        {prompt && step !== "input" && (
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-4">Request</h2>
            <div className="p-3 bg-gray-50 rounded-lg text-gray-700">
              {prompt}
            </div>
          </div>
        )}

        {step === "input" && (
          <form onSubmit={handleGetClarification}>
            <h2 className="text-xl font-bold mb-4">
              Describe the API you want:
            </h2>
            <textarea
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="E.g. A weather API that returns forecast details..."
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white py-2 rounded"
            >
              {loading ? "Processing..." : "Next"}
            </button>
          </form>
        )}
        {step === "clarify" && (
          <form onSubmit={handleConfirm}>
            <h2 className="text-xl font-bold mb-4">Clarification Needed</h2>
            <p className="mb-4 text-gray-700">
              {clarificationQuestion.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i < clarificationQuestion.split("\n").length - 1 && <br />}
                </span>
              ))}
            </p>
            <textarea
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              rows={5}
              value={clarification}
              onChange={(e) => setClarification(e.target.value)}
              placeholder="Your answer or further details"
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded"
            >
              {loading ? jobStatus || "Submitting..." : "Confirm & Deploy"}
            </button>
          </form>
        )}
        {step === "confirm" && (
          <form onSubmit={handleConfirm}>
            <div className="text-center mb-4">No clarifications needed.</div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full ${loading ? 'bg-gray-500 hover:bg-gray-600' : 'bg-green-500 hover:bg-green-600'} text-white py-2 rounded`}
            >
              {loading ? "Deploying..." : "Confirm & Deploy"}
            </button>
          </form>
        )}
        {step === "submitted" && generatedURL && (
          <div className="text-center">
            <h2 className="text-xl font-bold mb-4">Your API is live!</h2>
            <p className="mb-2">Call your new API endpoint:</p>
            <a
              href={generatedURL}
              target="_blank"
              rel="noreferrer"
              className="text-blue-500 underline"
            >
              {generatedURL}
            </a>
          </div>
        )}
        {loading && jobStatus && (
          <div className="mb-4 text-blue-600 text-center">
            <div className="animate-pulse">{jobStatus}</div>
          </div>
        )}
      </div>
    </div>
  );
}
