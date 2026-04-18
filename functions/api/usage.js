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
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];

    // Fetch subscription details (limits)
    const subRes = await fetch("https://api.openai.com/v1/dashboard/billing/subscription", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const subscription = await subRes.json();

    // Fetch usage details (spent)
    const usageRes = await fetch(`https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const usage = await usageRes.json();

    return new Response(JSON.stringify({
      total_granted: subscription.hard_limit_usd || 0,
      total_used: (usage.total_usage || 0) / 100, // API returns usage in cents
      remaining: (subscription.hard_limit_usd || 0) - ((usage.total_usage || 0) / 100)
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
