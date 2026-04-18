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

  // System Prompt for Identity and Cost Saving
  const systemMessage = {
    role: "system",
    content: `너는 비용 효율적이고 핵심 위주로 답변하는 유능한 비서야. 현재 네가 사용하는 모델명은 "${targetModel}"이야. 사용자가 자세한 설명을 요구하지 않는 한, 5줄 이내로 핵심만 명확하게 답변해줘.`
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
        max_completion_tokens: 1000, // Fixed for latest model specs
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
