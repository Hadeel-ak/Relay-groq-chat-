# Relay

A responsive chat workspace powered by Groq's Qwen 3.8 27B model. Conversations are saved in the current browser; the Groq API key stays on the local server.

## Run locally

1. Install Python 3.9 or newer.
2. Copy `.env.example` to `.env` and set `GROQ_API_KEY` to a key from [Groq Console](https://console.groq.com/keys).
3. Run `python server.py` from this folder.
4. Open [http://localhost:3000](http://localhost:3000).

You can also set `GROQ_API_KEY` directly in the environment. The server reports whether the key is configured in the sidebar. Do not commit `.env`. No third-party Python packages are needed.