# Agora API Documentation

## Overview

The Agora API provides endpoints for document management, workspace collaboration, chat interactions, and search functionality. All API endpoints require authentication unless otherwise specified.

**Base URL:** `https://your-domain.com/api`

**Authentication:** Bearer token via Supabase Auth

---

## Health & Status

### GET /api/health

Comprehensive health check endpoint that verifies all system dependencies.

**Response:**
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "0.1.0",
  "checks": {
    "database": {
      "status": "healthy" | "unhealthy",
      "responseTime": 15
    },
    "storage": {
      "status": "healthy" | "unhealthy"
    },
    "openai": {
      "status": "healthy" | "unhealthy"
    },
    "redis": {
      "status": "healthy" | "unhealthy",
      "responseTime": 5
    }
  }
}
```

**Status Codes:**
- `200` - Healthy or degraded (some services unavailable)
- `503` - Unhealthy (critical services unavailable)

---

### GET /api/health/live

Liveness probe for Kubernetes/Docker. Returns `200` if the application process is alive.

**Response:**
```json
{
  "status": "alive",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

---

### GET /api/health/ready

Readiness probe for Kubernetes/Docker. Returns `200` if the application is ready to serve traffic.

**Response:**
```json
{
  "status": "ready"
}
```

**Status Codes:**
- `200` - Ready
- `503` - Not ready

---

## Documents

### POST /api/documents/upload

Upload a document to a workspace.

**Request:**
- `Content-Type: multipart/form-data`
- `workspaceId` (string, UUID) - Required
- `file` (File) - Required, max 50MB
- `classification` (enum: "public" | "internal" | "confidential") - Optional, default: "internal"
- `title` (string) - Optional

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "workspace_id": "uuid",
    "title": "Document Title",
    "status": "active",
    "classification": "public",
    "created_at": "2024-01-01T12:00:00.000Z"
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Validation error
- `401` - Unauthorized
- `403` - Insufficient permissions
- `429` - Rate limit exceeded
- `500` - Server error

**Rate Limit:** 5 requests per minute per IP

---

### DELETE /api/documents/[documentId]

Delete a document from a workspace.

**Response:**
```json
{
  "success": true
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized
- `403` - Insufficient permissions
- `404` - Document not found

---

## Chat

### POST /api/chat

Send a message to the AI assistant and get a response.

**Request:**
```json
{
  "messages": [
    {
      "role": "user" | "assistant" | "system",
      "content": "Message content"
    }
  ],
  "workspaceId": "uuid",
  "conversationId": "uuid",
  "excludedDocumentIds": ["uuid"],
  "excludedNoteIds": ["uuid"],
  "excludedEvidenceIds": ["uuid"]
}
```

**Response:**
- Streaming response (Server-Sent Events)
- Content-Type: `text/event-stream`

**Status Codes:**
- `200` - Success (streaming)
- `400` - Validation error
- `401` - Unauthorized
- `429` - Rate limit exceeded
- `500` - Server error

**Rate Limit:** 10 requests per minute per IP

---

## Search

### GET /api/search

Search documents in a workspace.

**Query Parameters:**
- `workspaceId` (string, UUID) - Required
- `query` (string) - Required, min 1 character
- `domain` (string) - Optional
- `municipality` (string) - Optional
- `year` (string, YYYY format) - Optional
- `classification` (enum: "public" | "internal" | "confidential") - Optional
- `layer` (enum: "national" | "regional" | "municipal" | "local" | "other") - Optional
- `page` (number) - Optional, default: 1
- `pageSize` (number) - Optional, default: 20, max: 100

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Document Title",
      "workspace_id": "uuid",
      "classification": "public",
      "created_at": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8,
    "hasMore": true
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Validation error
- `401` - Unauthorized
- `429` - Rate limit exceeded

**Rate Limit:** 20 requests per minute per IP

---

### POST /api/search

Search documents with filters in request body.

**Request:**
```json
{
  "workspaceId": "uuid",
  "query": "search query",
  "filters": {
    "domain": "string",
    "municipality": "string",
    "year": "2024",
    "classification": "public",
    "layer": "national"
  },
  "page": 1,
  "pageSize": 20
}
```

**Response:** Same as GET /api/search

---

## Metrics

### GET /api/metrics

Get application metrics (for monitoring systems).

**Query Parameters:**
- `format` (enum: "json" | "prometheus") - Optional, default: "json"

**Response (JSON):**
```json
{
  "counters": [
    {
      "name": "api.request.count",
      "value": 1234,
      "tags": {
        "method": "GET",
        "path": "/api/search"
      }
    }
  ],
  "histograms": [
    {
      "name": "api.request.duration",
      "min": 10,
      "max": 5000,
      "avg": 250,
      "p50": 200,
      "p95": 800,
      "p99": 2000,
      "tags": {
        "method": "GET"
      }
    }
  ],
  "gauges": [
    {
      "name": "cache.size",
      "value": 1024,
      "timestamp": 1234567890
    }
  ],
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Response (Prometheus):**
```
api_request_count{method="GET",path="/api/search"} 1234
api_request_duration_avg{method="GET"} 250
api_request_duration_p95{method="GET"} 800
```

**Status Codes:**
- `200` - Success
- `500` - Server error

**Note:** In production, this endpoint should be protected or only accessible internally.

---

## Error Responses

All API endpoints return errors in a consistent format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional error details"
  }
}
```

**Common Error Codes:**
- `VALIDATION_ERROR` - Input validation failed
- `AUTHENTICATION_ERROR` - Authentication required
- `AUTHORIZATION_ERROR` - Insufficient permissions
- `NOT_FOUND_ERROR` - Resource not found
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `EXTERNAL_SERVICE_ERROR` - External service failure
- `INTERNAL_ERROR` - Internal server error

**Status Codes:**
- `400` - Bad Request (validation errors)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error
- `502` - Bad Gateway (external service error)

---

## Rate Limiting

Rate limits are applied per IP address using the `x-forwarded-for` header or IP address.

**Current Limits:**
- Chat API: 10 requests per minute
- Document Upload: 5 requests per minute
- Search API: 20 requests per minute

**Rate Limit Headers:**
- `Retry-After` - Seconds until rate limit resets (when exceeded)

---

## Pagination

Many endpoints support pagination using `page` and `pageSize` parameters.

**Parameters:**
- `page` (number) - Page number, minimum: 1, default: 1
- `pageSize` (number) - Items per page, minimum: 1, maximum: 100, default: 20

**Response Format:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8,
    "hasMore": true
  }
}
```

---

## Authentication

All API endpoints (except health checks) require authentication via Supabase Auth.

**Headers:**
```
Authorization: Bearer <supabase_access_token>
```

The access token is obtained through Supabase Auth login/signup flows.

---

## Webhooks & Events

Currently, the API does not support webhooks. Future versions may include:
- Document upload completion events
- Workspace activity events
- Chat message events

---

## Versioning

The API is currently at version `0.1.0`. Future versions will include versioning in the URL path:
- `/api/v1/...`
- `/api/v2/...`

---

## Support

For API support, please contact the development team or refer to the main project documentation.

