import { NextResponse } from "next/server"
import { completePlatformTask, hasPlatformLlmCredentials } from "@/lib/llm/resolve"

export async function GET() {
  try {
    if (!(await hasPlatformLlmCredentials())) {
      return NextResponse.json(
        {
          status: "error",
          message: "No platform LLM API key is stored",
          details: "Add a provider key in Platform admin",
        },
        { status: 500 },
      )
    }

    try {
      const testResponse = await completePlatformTask("chat_title", {
        messages: [{ role: "user", content: "Say OK" }],
        maxTokens: 5,
      })

      return NextResponse.json({
        status: "success",
        message: "Platform LLM is working",
        details: {
          model: testResponse.model,
          response: testResponse.text,
        },
      })
    } catch (apiError: unknown) {
      const status =
        typeof apiError === "object" && apiError && "status" in apiError
          ? Number((apiError as { status?: number }).status)
          : undefined
      const errorMessage = apiError instanceof Error ? apiError.message : String(apiError)
      const errorCode =
        typeof apiError === "object" && apiError && "code" in apiError
          ? String((apiError as { code?: string }).code)
          : undefined

      console.error("[OpenAI Status] API Error:", {
        status,
        code: errorCode,
        message: errorMessage,
      })

      if (
        status === 402 ||
        errorMessage.toLowerCase().includes("insufficient_quota") ||
        errorMessage.toLowerCase().includes("quota") ||
        errorMessage.toLowerCase().includes("billing") ||
        errorMessage.toLowerCase().includes("payment") ||
        errorMessage.toLowerCase().includes("credit") ||
        errorCode === "insufficient_quota" ||
        errorCode === "billing_not_active"
      ) {
        return NextResponse.json(
          {
            status: "quota_exceeded",
            message: "LLM provider quota exceeded or insufficient credits",
            details: {
              error: errorMessage,
              code: errorCode,
              suggestion: "Check billing for the key stored in Platform admin",
            },
          },
          { status: 402 },
        )
      }

      if (status === 429 || errorMessage.toLowerCase().includes("rate limit")) {
        return NextResponse.json(
          {
            status: "rate_limited",
            message: "LLM provider rate limit exceeded",
            details: {
              error: errorMessage,
              code: errorCode,
              suggestion: "Please wait a moment and try again",
            },
          },
          { status: 429 },
        )
      }

      if (
        status === 401 ||
        errorMessage.toLowerCase().includes("api key") ||
        errorMessage.toLowerCase().includes("authentication") ||
        errorMessage.toLowerCase().includes("invalid")
      ) {
        return NextResponse.json(
          {
            status: "authentication_failed",
            message: "LLM provider authentication failed",
            details: {
              error: errorMessage,
              code: errorCode,
              suggestion: "Rotate the provider key in Platform admin",
            },
          },
          { status: 401 },
        )
      }

      return NextResponse.json(
        {
          status: "api_error",
          message: "LLM provider error",
          details: {
            error: errorMessage,
            code: errorCode,
            status,
          },
        },
        { status: status || 500 },
      )
    }
  } catch (error) {
    console.error("[OpenAI Status] Unexpected error:", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Unexpected error checking LLM status",
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 500 },
    )
  }
}
