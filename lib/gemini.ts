
import { GoogleGenAI, Type, Modality } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- STRATEGIC OUTREACH PROTOCOL ENGINE ---
// Uses Thinking Mode for psychological profiling and script generation.
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
    console.error("Outreach Engine Error:", error);
    return null;
  }
};

// --- MOMENTUM ANALYSIS ENGINE ---
// Uses Flash for speed.
export const analyzeClientMomentum = async (clientData: any) => {
  const ai = getAI();
  const prompt = `
    ANALYZE CLIENT MOMENTUM.
    Client: ${JSON.stringify(clientData)}
    
    Task: Calculate a Momentum Score (0-100) and identify the Next Best Action.
    Factors:
    - Last contact date (Recency)
    - Deal value (Potential)
    - Completeness of profile data (Engagement)
    - Number of family members added (Trust)
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
    return { score: 50, nextAction: 'Manual review required' };
  }
};

// --- INVESTMENT REPORT GENERATOR ---
export const generateInvestmentReport = async (clientData: any) => {
  const ai = getAI();
  const prompt = `
    Generate a concise Investment Review Report for ${clientData.name}.
    Data: ${JSON.stringify(clientData)}
    
    Structure:
    1. Portfolio Summary
    2. Performance Analysis (Simulated based on profile)
    3. Recommended Rebalancing
    
    Tone: Professional, Encouraging, Advisory.
    Format: Plain Text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt
    });
    return response.text || "Report generation failed.";
  } catch (e) {
    return "Service unavailable.";
  }
};

// --- QUANTUM AUDIT ENGINE ---
// Uses Thinking Mode for deep analysis.
export const runQuantumDeepDive = async (clientData: any) => {
  const ai = getAI();
  const prompt = `
    PERFORM A QUANTUM-LEVEL FINANCIAL AUDIT.
    Dossier: ${JSON.stringify(clientData)}
    
    CRITICAL INSTRUCTION:
    Evaluate for multi-generational liability matching, tax decay, and insurance gaps.
    Use maximum thinking depth to identify non-obvious risks.
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
  } catch (error) { throw error; }
};

// --- QUANTUM LEAD SCORING ---
export const calculateLeadScore = async (clientData: any) => {
  const ai = getAI();
  const prompt = `CALCULATE CLOSING PROPENSITY for client: ${JSON.stringify(clientData)}. Use reasoning to model NPU decay.`;
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
  } catch (e) { return { score: 50, engagement_level: 'Stable', primary_reason: 'Analysis standby.' }; }
};

export const getCurrentMortgageRates = async () => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: "Current Singapore bank mortgage rates 2025. Return numeric average only.",
    config: { tools: [{ googleSearch: {} }] }
  });
  return response.text?.trim() || "3.5%";
};

export const getMarketRealityCheck = async (query: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: query,
    config: { tools: [{ googleSearch: {} }] }
  });
  return {
    text: response.text,
    sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks
  };
};

export const generateNextBestActions = async (clients: any[]) => {
  const ai = getAI();
  const prompt = `Analyze pipeline: ${JSON.stringify((clients || []).map(c => ({ id: c.id, name: c.profile?.name, status: c.followUp?.status })))}. Identify 3 high-probability revenue actions. Use deep reasoning.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 32768 },
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
  
  // Model selection based on task depth
  const model = useDeepReasoning ? "gemini-3-pro-preview" : "gemini-3-flash-preview";
  const config = useDeepReasoning ? { thinkingConfig: { thinkingBudget: 32768 } } : {};
  
  const systemInstruction = `
    You are Sproutly AI, an expert financial advisor co-pilot.
    Your goal is to help advisors close deals and serve clients better.

    MANDATORY RESPONSE FORMAT (Strictly follow this structure):
    
    1. **Direct Answer**: Concise response to the query.
    2. **Strategic Analysis**: 1-2 bullet points connecting the answer to the client's specific data (income, gaps, family).
    3. **Suggested Actions**: 2 distinct, actionable steps the advisor should take next.
    4. **Potential Objection**: Identify one likely objection the client might have and provide a 1-sentence rebuttal.

    FORMATTING RULES:
    - Use Markdown.
    - Use **Bold** for headers and emphasis.
    - Use bullet points for lists.
    - Keep paragraphs short (max 2-3 sentences).
    - NEVER output a single large block of text.
  `;

  const chat = ai.chats.create({ 
    model, 
    config: {
      ...config,
      systemInstruction
    }, 
    history: (history || []).map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })) 
  });
  const result = await chat.sendMessage({ message: `Context: ${JSON.stringify(clientState)}. User: ${userMessage}` });
  return result.text;
};

export const getFinancialNewsBriefing = async () => {
  const res = await getAI().models.generateContent({ 
    model: 'gemini-3-flash-preview', 
    contents: "Singapore financial market news today.", 
    config: { tools: [{ googleSearch: {} }] } 
  });
  return { news: (res.text || "").split('\n').map(l => ({ headline: l, impact: "Market Pulse" })) };
};

export const generateClientAudioBriefing = async (data: any) => {
  const res = await getAI().models.generateContent({ 
    model: 'gemini-2.5-flash-preview-tts', 
    contents: `Strategic briefing for advisor regarding ${data.profile?.name || 'Client'}.`, 
    config: { 
      responseModalities: [Modality.AUDIO], 
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } 
    } 
  });
  return res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

export const playRawAudio = async (b64: string) => {
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
};

export const generateDreamVideo = async (prompt: string, aspectRatio: string) => {
  let op = await getAI().models.generateVideos({ model: 'veo-3.1-fast-generate-preview', prompt, config: { numberOfVideos: 1, aspectRatio: aspectRatio as any } });
  while (!op.done) { await new Promise(r => setTimeout(r, 10000)); op = await getAI().operations.getVideosOperation({ operation: op }); }
  return `${op.response?.generatedVideos?.[0]?.video?.uri}&key=${process.env.API_KEY}`;
};
