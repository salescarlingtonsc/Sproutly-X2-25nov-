
import { GoogleGenAI, Type, Modality } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Checks if an error is a browser-level abort caused by app switching
 */
const isAbortError = (error: any) => {
  const msg = error?.message || String(error);
  return (
    error?.name === 'AbortError' || 
    msg.includes('aborted') || 
    msg.includes('cancelled') || 
    msg.includes('The operation was aborted') ||
    msg.includes('fetch failed')
  );
};

// --- STRATEGIC OUTREACH PROTOCOL ENGINE ---
export const generateAutomatedPitch = async (clientData: any) => {
  const ai = getAI();
  const currentStatus = clientData?.followUp?.status || 'new';
  
  const prompt = `
    GENERATE A STRATEGIC SALES PROTOCOL.
    CLIENT DOSSIER: ${JSON.stringify(clientData)}
    CURRENT PIPELINE STAGE: ${currentStatus}
    
    SYSTEM CONTEXT:
    We use a specific funnel: New -> Picked up -> NPU 1 to 6 (No Pick Ups) -> Appt set -> Appt met -> Pending -> Closed.
    
    TASK:
    1. If stage is NPU [X], craft a message that sounds persistent but respectful.
    2. If stage is 'Appt met', craft a 'Decision Bridge' message highlighting one gap in their CPF/Insurance.
    3. Generate an objection rebuttal for this specific profile.
    
    THINKING REQUIREMENTS:
    - Model the client's "Adherence Resistance" based on their current NPU level.
    - Analyze the psychological triggers based on their job title and age.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 32768 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            opening_hook: { type: Type.STRING },
            whatsapp_draft: { type: Type.STRING },
            objection_rebuttal: {
              type: Type.OBJECT,
              properties: {
                objection: { type: Type.STRING },
                script: { type: Type.STRING }
              }
            },
            closing_strategy: { type: Type.STRING }
          },
          required: ['opening_hook', 'whatsapp_draft', 'objection_rebuttal']
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    if (isAbortError(error)) return null;
    console.error("Outreach Engine Error:", error);
    return null;
  }
};

// --- MOMENTUM ANALYSIS ENGINE ---
export const analyzeClientMomentum = async (clientData: any) => {
  const ai = getAI();
  const prompt = `
    ANALYZE CLIENT MOMENTUM.
    Client: ${JSON.stringify(clientData)}
    
    Task: Calculate a Momentum Score (0-100) and identify the Next Best Action.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            nextAction: { type: Type.STRING }
          },
          required: ['score', 'nextAction']
        }
      }
    });
    return JSON.parse(response.text || '{"score": 50, "nextAction": "Review profile"}');
  } catch (e) {
    if (isAbortError(e)) return { score: 50, nextAction: 'Sync pending...' };
    return { score: 50, nextAction: 'Manual review required' };
  }
};

// --- INVESTMENT REPORT GENERATOR ---
export const generateInvestmentReport = async (clientData: any) => {
  const ai = getAI();
  const prompt = `Generate a concise Investment Review Report for ${clientData.name}. Data: ${JSON.stringify(clientData)}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt
    });
    return response.text || "Report generation failed.";
  } catch (e) {
    if (isAbortError(e)) return "Generation paused for app switch.";
    return "Service unavailable.";
  }
};

// --- QUANTUM AUDIT ENGINE ---
export const runQuantumDeepDive = async (clientData: any) => {
  const ai = getAI();
  const prompt = `PERFORM A QUANTUM-LEVEL FINANCIAL AUDIT. Dossier: ${JSON.stringify(clientData)}`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 32768 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executive_summary: { type: Type.STRING },
            critical_gaps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { 
                  area: { type: Type.STRING }, 
                  severity: { type: Type.STRING }, 
                  observation: { type: Type.STRING },
                  reasoning_path: { type: Type.STRING }
                }
              }
            },
            action_plan: { type: Type.ARRAY, items: { type: Type.STRING } },
            projected_impact_sgd: { type: Type.NUMBER }
          },
          required: ['executive_summary', 'critical_gaps', 'action_plan']
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
};

// --- DIRECTOR BRIEFING ENGINE ---
export const generateDirectorBriefing = async (stats: any) => {
  const ai = getAI();
  const prompt = `ACT AS AN ELITE AGENCY DIRECTOR. Analyze performance: ${JSON.stringify(stats)}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 16000 },
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                bottleneck: { type: Type.STRING },
                coaching_tip: { type: Type.STRING },
                strategic_observation: { type: Type.STRING }
            }
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (e) {
    if (isAbortError(e)) return null;
    return { bottleneck: "Data Analysis Unavailable", coaching_tip: "Focus on fundamentals.", strategic_observation: "Ensure data accuracy." };
  }
};

// --- MARKET INTEL PARSER ---
export const analyzeMarketIntel = async (rawText: string) => {
  const ai = getAI();
  const prompt = `Analyze market news: "${rawText}"`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 32768 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            summary: { type: Type.STRING },
            reason: { type: Type.STRING },
            impact_short: { type: Type.STRING },
            impact_mid: { type: Type.STRING },
            impact_long: { type: Type.STRING },
            sentiment: { type: Type.STRING, enum: ['bullish', 'bearish', 'neutral', 'volatile'] },
            regions: { type: Type.ARRAY, items: { type: Type.STRING } },
            tickers: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['headline', 'reason', 'impact_short', 'impact_mid', 'impact_long', 'sentiment']
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (e) {
    if (isAbortError(e)) throw e; // Caller handles re-trying
    console.error("Market Intel Error", e);
    throw new Error("Failed to process intelligence.");
  }
};

// --- LIVE MARKET NEWS FETCH ---
export const fetchLiveMarketNews = async () => {
  const ai = getAI();
  const prompt = `Search critical financial news stories for Singapore TODAY. Return JSON ARRAY.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const rawText = response.text || '';
    let jsonStr = rawText;
    const firstBracket = rawText.indexOf('[');
    const lastBracket = rawText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
        jsonStr = rawText.substring(firstBracket, lastBracket + 1);
    }
    
    try {
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (parseError) {
        return [];
    }
  } catch (e) {
    if (isAbortError(e)) return [];
    return [];
  }
};

// --- MARKET PULSE GENERATOR ---
export const generateMarketPulse = async (newsItems: any[]) => {
  const ai = getAI();
  const prompt = `Generate a Smart Market Pulse summary based on: ${JSON.stringify(newsItems.slice(0, 10))}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt
    });
    return response.text;
  } catch (e) {
    if (isAbortError(e)) return "Outlook sync paused...";
    return "Market Pulse data currently unavailable.";
  }
};

// --- QUANTUM LEAD SCORING ---
export const calculateLeadScore = async (clientData: any) => {
  const ai = getAI();
  const prompt = `CALCULATE CLOSING PROPENSITY for client: ${JSON.stringify(clientData)}.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 32768 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            engagement_level: { type: Type.STRING, enum: ['High', 'Stable', 'Low'] },
            primary_reason: { type: Type.STRING }
          },
          required: ['score', 'engagement_level', 'primary_reason']
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (e) { 
    if (isAbortError(e)) return { score: 50, engagement_level: 'Stable', primary_reason: 'Sync pending.' };
    return { score: 50, engagement_level: 'Stable', primary_reason: 'Analysis standby.' }; 
  }
};

export const getCurrentMortgageRates = async () => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "Current Singapore bank mortgage rates 2025. Return numeric average only.",
      config: { tools: [{ googleSearch: {} }] }
    });
    return response.text?.trim() || "3.5%";
  } catch (e) {
    return "3.5%";
  }
};

export const getMarketRealityCheck = async (query: string) => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: query,
      config: { tools: [{ googleSearch: {} }] }
    });
    return {
      text: response.text,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks
    };
  } catch (e) {
    if (isAbortError(e)) return { text: "Search paused..." };
    throw e;
  }
};

export const generateNextBestActions = async (clients: any[]) => {
  const ai = getAI();
  const prompt = `Analyze pipeline and identify 3 high-probability revenue actions: ${JSON.stringify(clients.map(c => c.id))}`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 16000 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { 
              clientId: { type: Type.STRING }, 
              clientName: { type: Type.STRING }, 
              action: { type: Type.STRING }, 
              priority: { type: Type.STRING }, 
              rationale: { type: Type.STRING } 
            }
          }
        }
      }
    });
    return JSON.parse(response.text || '[]');
  } catch (error) { return []; }
};

export const chatWithFinancialContext = async (history: any[], userMessage: string, clientState: any, useDeepReasoning: boolean = false) => {
  const ai = getAI();
  const model = useDeepReasoning ? "gemini-3-pro-preview" : "gemini-3-flash-preview";
  const config = useDeepReasoning ? { thinkingConfig: { thinkingBudget: 32768 } } : {};
  
  const systemInstruction = `You are Sproutly AI expert co-pilot. Direct, Strategic, Action-oriented.`;

  try {
    const chat = ai.chats.create({ 
      model, 
      config: { ...config, systemInstruction }, 
      history: (history || []).map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })) 
    });
    const result = await chat.sendMessage({ message: `Context: ${JSON.stringify(clientState)}. User: ${userMessage}` });
    return result.text;
  } catch (e) {
    if (isAbortError(e)) return null; // Silent for chat
    throw e;
  }
};

export const getFinancialNewsBriefing = async () => {
  try {
    const res = await getAI().models.generateContent({ 
      model: 'gemini-3-flash-preview', 
      contents: "Singapore financial market news today.", 
      config: { tools: [{ googleSearch: {} }] } 
    });
    return { news: (res.text || "").split('\n').map(l => ({ headline: l, impact: "Market Pulse" })) };
  } catch (e) {
    return { news: [] };
  }
};

export const generateClientAudioBriefing = async (data: any) => {
  try {
    const res = await getAI().models.generateContent({ 
      model: 'gemini-2.5-flash-preview-tts', 
      contents: `Strategic briefing for ${data.profile?.name || 'Client'}.`, 
      config: { 
        responseModalities: [Modality.AUDIO], 
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } 
      } 
    });
    return res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (e) {
    return null;
  }
};

export const playRawAudio = async (b64: string) => {
    if (!b64) return;
    try {
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        const decode = (base64: string) => {
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            return bytes;
        };
        const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) => {
            const dataInt16 = new Int16Array(data.buffer);
            const frameCount = dataInt16.length / numChannels;
            const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
            for (let channel = 0; channel < numChannels; channel++) {
                const channelData = buffer.getChannelData(channel);
                for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
            }
            return buffer;
        };
        const audioBuffer = await decodeAudioData(decode(b64), outputAudioContext, 24000, 1);
        const source = outputAudioContext.createBufferSource();
        source.buffer = audioBuffer; source.connect(outputAudioContext.destination); source.start();
    } catch (e) {
        console.warn("Audio playback aborted.");
    }
};

export const generateDreamVideo = async (prompt: string, aspectRatio: string) => {
  try {
    let op = await getAI().models.generateVideos({ model: 'veo-3.1-fast-generate-preview', prompt, config: { numberOfVideos: 1, aspectRatio: aspectRatio as any } });
    while (!op.done) { 
        await new Promise(r => setTimeout(r, 10000)); 
        op = await getAI().operations.getVideosOperation({ operation: op }); 
    }
    return `${op.response?.generatedVideos?.[0]?.video?.uri}&key=${process.env.API_KEY}`;
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw e;
  }
};

export const polishContent = async (text: string, tone: 'professional' | 'persuasive' | 'concise' = 'professional') => {
  const ai = getAI();
  const prompt = `Rewrite: "${text}" to be more ${tone}.`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text?.trim() || text;
  } catch (e) {
    if (isAbortError(e)) return text;
    return text;
  }
};

export const generateMessageTemplate = async (topic: string) => {
  const ai = getAI();
  const prompt = `Create WhatsApp template for: "${topic}".`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text?.trim() || "";
  } catch (e) {
    if (isAbortError(e)) return "";
    return "";
  }
};
