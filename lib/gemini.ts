

import { GoogleGenAI, Type } from "@google/genai";

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
 * Generates a hyper-personalized sales closing script based on client data.
 * Uses Gemini 2.5 Flash Lite for low-latency response.
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
      model: "gemini-2.5-flash-lite", // FAST
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
 * Uses Gemini 2.5 Flash Lite for low-latency response.
 */
export const getMarketRealityCheck = async (query: string) => {
  if (!ai) throw new Error("Missing Google API Key.");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite", // FAST
      contents: `Provide a concise answer with current data for: ${query}. Focus on Singapore context if applicable.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    return {
      text: response.text,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error) {
    console.error("Grounding Error:", error);
    throw error;
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
      1. Identify hidden correlations between their employment/income source and their assets (e.g., Tech worker with heavy Nasdaq exposure).
      2. Simulate 3 distinct economic stress scenarios (e.g., "Stagflation", "Property Market Correction", "Retrenchment").
      3. Analyze the specific impact of these scenarios on THIS client's cashflow and net worth.
      
      Think deeply about the second-order effects before answering.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", // INTELLIGENT
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 32768 }, // Max thinking for deep reasoning
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
 * Generates a follow-up message for CRM.
 * Uses Gemini 2.5 Flash Lite for low-latency response.
 */
export const generateFollowUpEmail = async (clientName: string, lastInteractionDate: string, notes: string) => {
  if (!ai) return "Error: AI not configured.";

  try {
    const prompt = `
      Write a short, professional, yet warm WhatsApp/Email follow-up message for a financial advisor.
      Client Name: ${clientName}
      Last Contact: ${lastInteractionDate}
      Context/Notes: ${notes || "General check-in"}
      
      The goal is to book a review meeting. Don't sound salesy. Sound like a trusted partner.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite", // FAST
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
 *  Uses Gemini 3 Pro with Thinking Mode to reason across the entire client state.
 */
export const chatWithFinancialContext = async (history: any[], userMessage: string, clientState: any) => {
  if (!ai) return "AI Service Unavailable. Please configure API Key.";

  try {
    const systemInstruction = `
      You are "Sproutly Quantum AI", a world-class financial planning assistant.
      You are chatting with a Financial Advisor who is currently looking at a specific client's profile.
      
      CURRENT CLIENT DATA:
      ${JSON.stringify(clientState)}
      
      YOUR ROLE:
      1. Answer specific questions about the client's data (e.g., "What is their net worth?", "When do they run out of money?").
      2. Provide strategic advice on how to close the deal or optimize the plan.
      3. Perform "What If" analysis based on the data provided (e.g., "What if inflation is 5%?").
      4. Be concise, professional, and sales-oriented.
      
      If the user asks for calculations, perform them based on the provided JSON data.
    `;

    // Construct chat history for the API
    const chat = ai.chats.create({
      model: 'gemini-3-pro-preview', // INTELLIGENT
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 32768 }, // Max thinking for conversational reasoning
      },
      history: history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      }))
    });

    const result = await chat.sendMessage({ message: userMessage });
    return result.text;

  } catch (error) {
    console.error("Chat Error:", error);
    return "I'm having trouble connecting to the Quantum Brain right now. Please try again.";
  }
};
