Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { to, body, calendar_url } = await req.json();

    // Validation
    if (!to || typeof to !== "string") {
      return new Response(JSON.stringify({ error: "Invalid request", details: "Recipient number 'to' is required and must be a string." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!body || typeof body !== "string" || body.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Invalid request", details: "Message 'body' is required and cannot be empty." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let finalBody = body.trim();

    if (calendar_url && typeof calendar_url === "string") {
      try {
        console.log("Shortening calendar URL...");
        const shortenResp = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(calendar_url)}`);
        if (shortenResp.ok) {
          const shortUrl = (await shortenResp.text()).trim();
          // Validate the response is actually a URL, not an error message
          // is.gd sometimes returns "Error, database insert failed" with HTTP 200
          if (shortUrl.startsWith("http://") || shortUrl.startsWith("https://")) {
            finalBody += `\nהוספה ליומן: ${shortUrl}`;
          } else {
            console.warn("URL shortener returned invalid response:", shortUrl, "— using original URL");
            finalBody += `\nהוספה ליומן: ${calendar_url}`;
          }
        } else {
          console.warn("URL shortening failed (non-OK response), using original URL");
          finalBody += `\nהוספה ליומן: ${calendar_url}`;
        }
      } catch (shortenErr) {
        console.error("URL shortening fetch error:", shortenErr);
        finalBody += `\nהוספה ליומן: ${calendar_url}`;
      }
    }

    // Truncate to safe length (Twilio limit is technically higher but 1600 is safe)
    const trimmedBody = finalBody.substring(0, 1600);

    // Read Twilio configuration from environment variables
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");

    if (!accountSid || !authToken || !fromNumber) {
      const missing = [];
      if (!accountSid) missing.push("TWILIO_ACCOUNT_SID");
      if (!authToken) missing.push("TWILIO_AUTH_TOKEN");
      if (!fromNumber) missing.push("TWILIO_FROM_NUMBER");
      
      console.error(`Missing configuration: ${missing.join(", ")}`);
      return new Response(JSON.stringify({ 
        error: "Configuration error", 
        details: `Missing environment variables: ${missing.join(", ")}` 
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Build the Twilio API request
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const authHeader = btoa(`${accountSid}:${authToken}`);

    const formData = new URLSearchParams();
    formData.append("To", to);
    formData.append("From", fromNumber);
    formData.append("Body", trimmedBody);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${authHeader}`,
      },
      body: formData.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Twilio API Error:", data);
      return new Response(JSON.stringify({ error: "Twilio request failed", details: data }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      sid: data.sid, 
      status: data.status 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("SMS function error:", err);
    return new Response(JSON.stringify({ 
      error: "Internal error", 
      details: err.message ?? "Unknown error" 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
