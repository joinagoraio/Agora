import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { env } from "@/lib/env"

export async function GET(req: NextRequest) {
  try {
    // Check if API key is configured
    if (!env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          status: "error",
          message: "OpenAI API key is not configured",
          details: "OPENAI_API_KEY environment variable is not set",
        },
        { status: 500 }
      )
    }

    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    })

    // Try a minimal API call to test the key and check for quota issues
    try {
      const testResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "Say 'OK' if you can read this.",
          },
        ],
        max_tokens: 5,
      })

      const responseText = testResponse.choices[0]?.message?.content || ""

      return NextResponse.json({
        status: "success",
        message: "OpenAI API is working correctly",
        details: {
          model: "gpt-4o-mini",
          response: responseText,
          usage: testResponse.usage,
        },
      })
    } catch (apiError: any) {
      // Handle OpenAI API errors
      const status = apiError?.status || apiError?.response?.status
      const errorMessage = apiError?.message || String(apiError)
      const errorCode = apiError?.code || apiError?.type
      const errorDetails = apiError?.error || {}

      console.error("[OpenAI Status] API Error:", {
        status,
        code: errorCode,
        message: errorMessage,
        error: errorDetails,
      })

      // Check for quota/credit issues
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
            message: "OpenAI API quota exceeded or insufficient credits",
            details: {
              error: errorMessage,
              code: errorCode,
              suggestion:
                "Please add credits to your OpenAI account at https://platform.openai.com/account/billing",
            },
          },
          { status: 402 }
        )
      }

      // Check for rate limit
      if (status === 429 || errorMessage.toLowerCase().includes("rate limit")) {
        return NextResponse.json(
          {
            status: "rate_limited",
            message: "OpenAI API rate limit exceeded",
            details: {
              error: errorMessage,
              code: errorCode,
              suggestion: "Please wait a moment and try again",
            },
          },
          { status: 429 }
        )
      }

      // Check for authentication errors
      if (
        status === 401 ||
        errorMessage.toLowerCase().includes("api key") ||
        errorMessage.toLowerCase().includes("authentication") ||
        errorMessage.toLowerCase().includes("invalid")
      ) {
        return NextResponse.json(
          {
            status: "authentication_failed",
            message: "OpenAI API authentication failed",
            details: {
              error: errorMessage,
              code: errorCode,
              suggestion: "Please check your OPENAI_API_KEY environment variable",
            },
          },
          { status: 401 }
        )
      }

      // Generic API error
      return NextResponse.json(
        {
          status: "api_error",
          message: "OpenAI API error",
          details: {
            error: errorMessage,
            code: errorCode,
            status,
            fullError: errorDetails,
          },
        },
        { status: status || 500 }
      )
    }
  } catch (error) {
    console.error("[OpenAI Status] Unexpected error:", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Unexpected error checking OpenAI status",
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 500 }
    )
  }
}
