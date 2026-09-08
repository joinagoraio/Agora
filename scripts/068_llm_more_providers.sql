-- Seed Gemini, Groq, xAI Grok, Ollama, and OpenRouter. Existing rows keep their endpoint.

INSERT INTO public.llm_providers (id, label, enabled, sort_order, adapter, endpoint) VALUES
  ('gemini', 'Google Gemini', false, 3, 'openai-compatible', 'https://generativelanguage.googleapis.com/v1beta/openai'),
  ('groq', 'Groq', false, 4, 'openai-compatible', 'https://api.groq.com/openai/v1'),
  ('xai', 'xAI Grok', false, 5, 'openai-compatible', 'https://api.x.ai/v1'),
  ('ollama', 'Ollama (local)', false, 6, 'openai-compatible', 'http://127.0.0.1:11434/v1'),
  ('openrouter', 'OpenRouter', false, 7, 'openai-compatible', 'https://openrouter.ai/api/v1')
ON CONFLICT (id) DO NOTHING;

UPDATE public.llm_providers SET sort_order = 5 WHERE id = 'xai';
UPDATE public.llm_providers SET sort_order = 6 WHERE id = 'ollama';
UPDATE public.llm_providers SET sort_order = 7 WHERE id = 'openrouter';
UPDATE public.llm_providers SET enabled = false WHERE id IN ('gemini', 'groq', 'xai', 'ollama', 'openrouter');
