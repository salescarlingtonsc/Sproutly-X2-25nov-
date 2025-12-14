
import { GoogleGenAI, Type, Modality } from "@google/genai";

// --- ROBUST API KEY LOADER ---
// Prevents "process is not defined" crash in Vite/Browser environments
const getApiKey = () => {
  let key = '';
  
  // 1. Try Vite / Modern Browser Standard
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      key = (import.meta as any).env.VITE_GOOGLE_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY || '';
    }
  } catch (e) {}

  // 2. Try Node.js / Process Fallback
  if (!key) {
    try {
      if (typeof process !== 'undefined' && process.env) {
        key = process.env.API_KEY || process.env.VITE_GOOGLE_API_KEY || '';
      }
    } catch (e) {}
  }
  
  return key;
};

const apiKey = getApiKey();

// Initialize safely - if no key, we don't crash immediately, but functions will fail gracefully
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * HELPER: Decodes Base64 to ArrayBuffer
 */
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * HELPER: Plays Raw PCM Audio from Gemini
 * 24kHz sample rate is standard for Gemini Flash TTS
 */
export const playRawAudio = async (base64Audio: string) => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const pcmData = decodeBase64(base64Audio);
  
  // Convert Int16 PCM to Float32
  const inputData = new Int16Array(pcmData.buffer);
  const float32Data = new Float32Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    float32Data[i] = inputData[i] / 32768.0;
  }

  const audioBuffer = audioContext.createBuffer(1, float32Data.length, 24000);
  audioBuffer.getChannelData(0).set(float32Data);

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start(0);
  
  return source; // Return source to allow stopping if needed
};

/**
 * Generates an audio briefing for the agent.
 * Uses a two-step process:
 * 1. Generate text script using gemini-2.5-flash-lite (FAST)
 * 2. Convert script to audio using gemini-2.5-flash-preview-tts (Audio Model)
 */
export const generateClientAudioBriefing = async (clientData: any) => {
  if (!ai) throw new Error("Missing Google API Key.");

  try {
    // Step 1: Generate the script (Reasoning)
    // We use the text model to parse the data and create a natural speech script.
    const scriptPrompt = `
      You are an executive assistant briefing a financial advisor before a meeting.
      Client Data: ${JSON.stringify(clientData)}
      
      Generate a short spoken summary (approx 40-50 words).
      Structure:
      1. Mention Client Name & key demographic.
      2. State their biggest financial gap or opportunity clearly.
      3. Suggest a recommended ice-breaker.
      
      Tone: Professional, concise, encouraging. Speak naturally. Do not use markdown formatting.
    `;

    const scriptResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite", // LOW LATENCY
      contents: { parts: [{ text: scriptPrompt }] },
    });

    const scriptText = scriptResponse.text;
    if (!scriptText) throw new Error("Failed to generate briefing script.");

    // Step 2: Generate Audio (TTS)
    // We pass the clean text script to the TTS model.
    const ttsResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: { parts: [{ text: scriptText }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' } // 'Kore' is authoritative but warm
          },
        },
      },
    });

    const audioData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) throw new Error("No audio data returned from TTS model.");
    
    return audioData;

  } catch (error) {
    console.error("Audio Briefing Error:", error);
    throw error;
  }
};

/**
 * Generates a hyper-personalized sales closing script based on client data.
 * Uses Gemini 2.5 Flash Lite for MAXIMUM SPEED (User is waiting).
 */
export const generateClientStrategy = async (clientProfile: any, financialMetrics: any) => {
  if (!ai) throw new Error("Missing Google API Key. Please configure VITE_GOOGLE_API_KEY.");
  
  try {
    const prompt = `
      You are a world-class financial advisor closing a deal. 
      Analyze this client profile and financial metrics.
      
      Client: ${JSON.stringify(clientProfile)}
      Metrics: ${JSON.stringify(financialMetrics)}
      
      Output a structured sales strategy in JSON format with the following keys:
      1. "hook": A one-sentence emotional hook based on their gaps (e.g., specific fear about child's uni).
      2. "gap_analysis": A brutal but factual breakdown of their protection or retirement gap.
      3. "solution_pitch": A concise value proposition for the recommended action.
      4. "urgency_driver": Why they must act *today* (cost of delay).
      
      Keep the tone professional, empathetic, but authoritative.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite", // LOW LATENCY
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hook: { type: Type.STRING },
            gap_analysis: { type: Type.STRING },
            solution_pitch: { type: Type.STRING },
            urgency_driver: { type: Type.STRING },
          }
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("AI Strategy Gen Error:", error);
    throw error;
  }
};

/**
 * Uses Google Search Grounding to find live market data.
 * MUST USE gemini-2.5-flash (Standard).
 */
export const getMarketRealityCheck = async (query: string) => {
  if (!ai) throw new Error("Missing Google API Key.");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: `Provide a concise, professional financial summary for: ${query}. 
      Include key numbers, dates, and a brief implication for Singaporean investors if applicable.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    return {
      text: response.text,
      // Extract grounding metadata to show sources
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error) {
    console.error("Grounding Error:", error);
    throw error;
  }
};

/**
 * Fetches top 3 financial headlines for Singapore.
 * Uses Search Grounding.
 */
export const getFinancialNewsBriefing = async () => {
  if (!ai) throw new Error("Missing Google API Key.");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "What are the top 3 most important financial news headlines for Singapore right now (Markets, CPF, Housing)? Return a JSON list with 'headline' and 'impact'.",
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            news: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  headline: { type: Type.STRING },
                  impact: { type: Type.STRING }
                }
              }
            }
          }
        }
      },
    });

    return JSON.parse(response.text || "{ \"news\": [] }");
  } catch (error) {
    console.error("News Briefing Error:", error);
    return { news: [] };
  }
};

/**
 * Fetches real-time Singapore mortgage rates.
 * Uses Search Grounding.
 */
export const getCurrentMortgageRates = async () => {
  if (!ai) throw new Error("Missing Google API Key.");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "What are the current average fixed and floating mortgage rates in Singapore? Return just the single most common percentage number for a 30-year fixed loan (e.g. 3.2). Return ONLY the number.",
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    return response.text?.trim() || "3.5";
  } catch (error) {
    console.error("Rate Fetch Error:", error);
    return "3.5";
  }
};

/**
 * Uses Gemini 3 Pro with Thinking Mode to perform a deep risk simulation.
 * This simulates economic scenarios against the client's specific portfolio.
 */
export const runDeepRiskAnalysis = async (clientData: any) => {
  if (!ai) throw new Error("Missing Google API Key.");

  try {
    const prompt = `
      Perform a deep-dive financial risk analysis for this client.
      Client Data: ${JSON.stringify(clientData)}
      
      Task:
      1. Identify hidden correlations between their employment/income source and their assets.
      2. Simulate 3 distinct economic stress scenarios (e.g., "Stagflation", "Property Market Correction").
      3. Analyze the specific impact on THIS client's cashflow.
      
      Think deeply about second-order effects.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", // INTELLIGENT
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 32768 }, // MAX THINKING POWER
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executive_summary: { type: Type.STRING },
            hidden_risks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  risk: { type: Type.STRING },
                  probability: { type: Type.STRING },
                  impact: { type: Type.STRING }
                }
              }
            },
            scenario_simulations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  scenario_name: { type: Type.STRING },
                  outcome_description: { type: Type.STRING },
                  portfolio_impact: { type: Type.STRING } 
                }
              }
            }
          }
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Deep Risk Gen Error:", error);
    throw error;
  }
};

/**
 * Generates an Investment Thesis using Thinking Mode.
 * Analyzes allocation, risk, and time horizon.
 */
export const generateInvestmentThesis = async (clientProfile: any, investorState: any) => {
  if (!ai) throw new Error("Missing Google API Key.");

  try {
    const prompt = `
      Act as a Chief Investment Officer. Analyze this client's portfolio.
      
      Client Profile: ${JSON.stringify(clientProfile)}
      Current Portfolio State: ${JSON.stringify(investorState)}
      
      Task:
      1. Critique the current "Portfolio Type" against their Age and Retirement goals.
      2. Identify if they are too conservative (inflation risk) or too aggressive (volatility risk).
      3. Provide a concrete "Thesis" on how they should restructure.
      
      Use Thinking Mode to calculate implied annualized return requirements vs current trajectory.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 16000 }, 
      }
    });

    return response.text;
  } catch (error) {
    console.error("Investment Thesis Error:", error);
    throw error;
  }
};

/**
 * Evaluates Property Purchase Feasibility using Thinking Mode.
 * Stresses interest rates and loan service ratios.
 */
export const evaluatePropertyPurchase = async (clientProfile: any, propertyState: any, cashflowState: any) => {
  if (!ai) throw new Error("Missing Google API Key.");

  try {
    const prompt = `
      Act as a Real Estate Strategist. Evaluate this property purchase.
      
      Client: ${JSON.stringify(clientProfile)}
      Property Goal: ${JSON.stringify(propertyState)}
      Cashflow Reality: ${JSON.stringify(cashflowState)}
      
      Task:
      1. Calculate the Mortgage Servicing Ratio (MSR) and Total Debt Servicing Ratio (TDSR) estimates.
      2. Simulate an interest rate spike to 5%. Can they still afford it?
      3. Analyze the "Cash Wall" - do they have enough liquid cash for downpayment + BSD + renovation?
      4. Give a "Go / Caution / Stop" verdict with reasons.
      
      Think step-by-step through the math.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 16000 },
      }
    });

    return response.text;
  } catch (error) {
    console.error("Property Eval Error:", error);
    throw error;
  }
};

/**
 * Generates a video using Veo 3 (veo-3.1-fast-generate-preview).
 */
export const generateDreamVideo = async (prompt: string, aspectRatio: '16:9' | '9:16' = '16:9') => {
  if (!ai) throw new Error("Missing Google API Key.");

  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: aspectRatio
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    
    if (!videoUri) throw new Error("Video generation failed.");

    return `${videoUri}&key=${apiKey}`;

  } catch (error) {
    console.error("Veo Generation Error:", error);
    throw error;
  }
};

/**
 * Generates a WhatsApp marketing message.
 * USES FLASH-LITE FOR LOW LATENCY.
 */
export const generateWhatsAppDraft = async (topic: string, context?: any) => {
  if (!ai) return "Error: AI not configured.";

  try {
    const prompt = `
      Write a short, punchy, professional WhatsApp message for a financial advisor to send to a client.
      Topic: ${topic}
      Client Context: ${context ? JSON.stringify(context) : "General mass broadcast"}
      
      Guidelines:
      - Use emojis sparingly but effectively.
      - Keep it under 50 words.
      - Call to action: "Let's chat?".
      - Tone: Trusted Advisor.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite", // LOW LATENCY OPTIMIZATION
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error("WhatsApp Gen Error:", error);
    return "Error generating draft.";
  }
};

/**
 * Generates a follow-up message.
 * USES FLASH-LITE FOR LOW LATENCY.
 */
export const generateFollowUpEmail = async (clientName: string, lastInteractionDate: string, notes: string) => {
  if (!ai) return "Error: AI not configured.";

  try {
    const prompt = `
      Write a professional yet warm follow-up message for a financial advisor.
      Client: ${clientName}
      Last Contact: ${lastInteractionDate}
      Notes: ${notes}
      Goal: Book review.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite", // LOW LATENCY OPTIMIZATION
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error("Email Gen Error:", error);
    return "Error generating draft.";
  }
};

/**
 *  Conversational AI Agent (Chatbot)
 *  Supports switching between "Lite" (Fast) and "Pro" (Reasoning) modes.
 */
export const chatWithFinancialContext = async (history: any[], userMessage: string, clientState: any, useLite: boolean = false) => {
  if (!ai) return "AI Service Unavailable. Please configure API Key.";

  try {
    const systemInstruction = `
      You are "Sproutly Quantum AI", a world-class financial planning assistant.
      
      CURRENT CLIENT DATA:
      ${JSON.stringify(clientState)}
      
      YOUR ROLE:
      1. Answer specific questions about the client's data.
      2. Provide strategic advice.
      3. Perform "What If" analysis.
      
      MODE: ${useLite ? 'FAST RESPONSE (Be concise, direct, helpful)' : 'DEEP THINKING (Analyze thoroughly, simulate outcomes)'}
    `;

    const model = useLite ? "gemini-2.5-flash-lite" : "gemini-3-pro-preview";
    const config = useLite ? { systemInstruction } : {
        systemInstruction,
        thinkingConfig: { thinkingBudget: 32768 }, // MAX REASONING
    };

    const chat = ai.chats.create({
      model,
      config,
      history: history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      }))
    });

    const result = await chat.sendMessage({ message: userMessage });
    return result.text;

  } catch (error) {
    console.error("Chat Error:", error);
    return "I'm having trouble connecting to the Quantum Brain right now.";
  }
};
