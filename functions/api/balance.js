export async function onRequestGet(context) {
  const { env } = context;
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API Key not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/dashboard/billing/credit_grants', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || 'Failed to fetch balance.' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 잔여 크레딧 = total_granted - total_used
    const remaining = (data.total_granted || 0) - (data.total_used || 0);

    return new Response(JSON.stringify({
      total_granted: data.total_granted,
      total_used: data.total_used,
      total_available: remaining,
      grants: data.data || [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
