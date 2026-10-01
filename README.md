# Relay

A responsive chat workspace powered by Groq's Qwen 3.8 27B model. Conversations are saved in the current browser; the Groq API key stays on the local server.

## Run locally

Front page of the webapp

<img width="1876" height="895" alt="Screenshot 2026-10-01 121830" src="https://github.com/user-attachments/assets/f66ac6a7-868b-48e4-a3d9-ba05ba2aa54c" />

conversation in the relay webapp

<img width="1867" height="941" alt="Screenshot 2026-10-01 121916" src="https://github.com/user-attachments/assets/614a7ce7-361a-4f5a-b5e0-d474683f3616" />


1. Install Python 3.9 or newer.
2. Copy `.env.example` to `.env` and set `GROQ_API_KEY` to a key from [Groq Console](https://console.groq.com/keys).
3. Run `python server.py` from this folder.
4. Open [http://localhost:3000](http://localhost:3000).

You can also set `GROQ_API_KEY` directly in the environment. The server reports whether the key is configured in the sidebar. Do not commit `.env`. No third-party Python packages are needed.
