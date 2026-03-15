"""
Kisan Saathi - Backend using Groq Cloud
"""
import json
import os

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request, stream_with_context
from flask_cors import CORS
from groq import Groq

load_dotenv()

app = Flask(__name__)
CORS(app)

DEFAULT_MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPTS = {
    "hi": """तुम "किसान साथी" हो — भारत के ग्रामीण किसानों के लिए बनाया गया एक सहायक AI।
तुम्हें हमेशा सरल हिंदी में जवाब देना है जो एक साधारण किसान भी समझ सके।
कठिन तकनीकी शब्दों से बचो।

तुम इन विषयों में मदद करते हो:
- फसल की सलाह (गेहूं, धान, मक्का, दलहन, सब्जियां, फल)
- सरकारी योजनाएं: PM-Kisan, Fasal Bima Yojana, Kisan Credit Card, eNAM
- कीट और बीमारी की पहचान और जैविक उपचार
- मिट्टी जांच और उर्वरक सलाह
- सिंचाई के तरीके
- जैविक खेती और बाजार भाव
- मौसम के हिसाब से खेती की सलाह

जवाब का तरीका:
- "किसान भाई" से संबोधित करो
- छोटे-छोटे पैराग्राफ में लिखो
- हमेशा सकारात्मक और प्रोत्साहित करने वाले रहो""",
    "en": """You are "Kisan Saathi" — an AI assistant built for Indian farmers in rural areas.
Always respond in simple, clear English that a person with basic education can understand.

You help with:
- Crop advice (wheat, rice, maize, pulses, vegetables, fruits)
- Government schemes: PM-Kisan, Fasal Bima Yojana, Kisan Credit Card, eNAM
- Pest/disease identification and organic treatments
- Soil testing and fertilizer advice
- Irrigation methods
- Organic farming and market prices
- Weather-based farming tips

Always address the user as "farmer friend" and be warm and encouraging.""",
}


def build_messages(system_prompt, history, user_message):
    messages = [{"role": "system", "content": system_prompt}]

    for turn in history:
        content = turn.get("content", "").strip()
        if not content:
            continue

        role = "assistant" if turn.get("role") == "assistant" else "user"
        messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user_message})
    return messages


def get_model_name():
    return os.environ.get("GROQ_MODEL", DEFAULT_MODEL)


def get_api_key():
    return os.environ.get("GROQ_API_KEY", "").strip()


def has_real_api_key():
    api_key = get_api_key()
    return bool(api_key) and not api_key.startswith("PASTE_")


def get_client():
    if not has_real_api_key():
        raise ValueError("GROQ_API_KEY is not set in .env")
    return Groq(api_key=get_api_key())


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(force=True)
    if not data:
        return jsonify({"error": "No data received"}), 400

    user_message = data.get("message", "").strip()
    history = data.get("history", [])
    lang = data.get("lang", "hi")

    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    system_prompt = SYSTEM_PROMPTS.get(lang, SYSTEM_PROMPTS["hi"])
    messages = build_messages(system_prompt, history[-20:], user_message)

    def generate():
        try:
            stream = get_client().chat.completions.create(
                model=get_model_name(),
                messages=messages,
                temperature=1,
                max_completion_tokens=1024,
                top_p=1,
                stream=True,
                stop=None,
            )

            for chunk in stream:
                text = chunk.choices[0].delta.content or ""
                if text:
                    payload = json.dumps({"chunk": text})
                    yield f"data: {payload}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as exc:
            error_payload = json.dumps({"error": str(exc)})
            yield f"data: {error_payload}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "api_key_set": has_real_api_key(),
            "provider": "Groq Cloud",
            "model": get_model_name(),
        }
    )


@app.route("/api/clear", methods=["POST"])
def clear():
    return jsonify({"status": "cleared"})


if __name__ == "__main__":
    print("\n" + "=" * 55)
    print("Kisan Saathi Server Starting (Groq Cloud)...")
    print("=" * 55)
    if not has_real_api_key():
        print("WARNING: GROQ_API_KEY not found in .env file!")
    else:
        print("Groq Cloud API key loaded from .env")
    print("Opening at: http://localhost:8080")
    print("Press Ctrl+C to stop")
    print("=" * 55 + "\n")
    app.run(debug=True, port=8080, host="0.0.0.0")
