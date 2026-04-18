export async function onRequestGet(context) {
  const { env } = context;
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API Key not configured." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Get start of current month as unix timestamp
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startTime = Math.floor(startOfMonth.getTime() / 1000);
    const endTime = Math.floor(now.getTime() / 1000);

    // Use OpenAI's new Organization Usage API
    const res = await fetch(
      `https://api.openai.com/v1/organization/usage/completions?start_time=${startTime}&end_time=${endTime}&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: `OpenAI API error: ${res.status}`, detail: err }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await res.json();

    // Pricing per 1M tokens (latest, USD)
    const PRICING = {
      "gpt-5.4-mini": { input: 0.15, output: 0.60 },
      "gpt-5.4":      { input: 2.50, output: 10.00 },
    };

    // Aggregate usage and cost
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    const modelBreakdown = {};

    for (const bucket of (data.data || [])) {
      for (const result of (bucket.results || [])) {
        const model = result.model || "unknown";
        const inputT = result.input_tokens || 0;
        const outputT = result.output_tokens || 0;

        totalInputTokens += inputT;
        totalOutputTokens += outputT;

        const prices = PRICING[model] || { input: 0.15, output: 0.60 };
        const cost = (inputT / 1_000_000) * prices.input + (outputT / 1_000_000) * prices.output;
        totalCost += cost;

        if (!modelBreakdown[model]) modelBreakdown[model] = { inputTokens: 0, outputTokens: 0, cost: 0 };
        modelBreakdown[model].inputTokens += inputT;
        modelBreakdown[model].outputTokens += outputT;
        modelBreakdown[model].cost += cost;
      }
    }

    return new Response(JSON.stringify({
      period: `${startOfMonth.toISOString().split('T')[0]} ~ ${now.toISOString().split('T')[0]}`,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalCost: parseFloat(totalCost.toFixed(6)),
      modelBreakdown,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
