export async function onRequestPost(context) {
  const { env, request } = context;
  const { messages, model } = await request.json();

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API Key not configured in Cloudflare." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Cost-Optimized Smart Routing
  let targetModel = model;
  if (model === 'auto') {
    const lastMessage = messages[messages.length - 1];
    const isMultiModal = Array.isArray(lastMessage.content) && lastMessage.content.some(c => c.type === 'image_url');
    const isLongContext = JSON.stringify(messages).length > 2000;
    
    // Escalate to Heavy if Image or Long Context
    if (isMultiModal || isLongContext) {
      targetModel = "gpt-5.4";
    } else {
      targetModel = "gpt-5.4-mini";
    }
  }

  // System Prompt - High Quality, Structured Responses
  const systemMessage = {
    role: "system",
    content: `You are a helpful, expert-level AI assistant. Your current model is "${targetModel}".

When answering questions, follow these principles:
- **Use rich Markdown formatting**: Use headers (##, ###), bold (**text**), bullet lists, numbered lists, horizontal rules (---), and code blocks where appropriate.
- **Be comprehensive yet concise**: Provide thorough, well-structured answers. Don't truncate important information.
- **Use emojis strategically** to make content visually scannable (e.g., ✅, 🔑, ⚠️, 💡).
- **Structure complex answers** with clear sections and hierarchy.
- **For technical questions**: Provide code examples in proper code blocks with language labels.
- **Be direct and confident**: Lead with the key answer, then provide supporting details.
- **Language**: Respond in the same language the user writes in (Korean if they write in Korean).

Always aim to provide the quality and depth of response that a senior expert would give.`
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [systemMessage, ...messages],
        stream: true,
        max_completion_tokens: 4000, // Sufficient for detailed responses
      }),
    });

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
