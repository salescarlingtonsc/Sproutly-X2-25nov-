
import { convert24to12 } from './helpers';

// Helper to format date into "Saturday ( 17 January @ 8 pm )"
export const formatAppt = (dateStr: string | null, timeStr?: string | null) => {
  if (!dateStr || dateStr === 'undefined' || dateStr === '') return '( Date @ Time )';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '( Date @ Time )';
    
    // Formatting: Saturday
    const weekday = date.toLocaleDateString('en-SG', { weekday: 'long' });
    // Formatting: 17
    const day = date.getDate();
    // Formatting: January (Full Month)
    const month = date.toLocaleDateString('en-SG', { month: 'long' });
    // Formatting: 8 pm
    const time = timeStr ? convert24to12(timeStr) : '12 pm';
    
    return `${weekday} ( ${day} ${month} @ ${time} )`;
  } catch (e) {
    return '( Date @ Time )';
  }
};

/**
 * Replaces placeholders like {name}, {date}, {time}, {formatted_appt} with actual client data
 */
export const interpolateTemplate = (content: string, name: string, date: string, time: string) => {
  return content
    .replace(/{name}/g, name || 'there')
    .replace(/{{name}}/g, name || 'there')
    .replace(/{date}/g, date || '(Date)')
    .replace(/{time}/g, time ? convert24to12(time) : '(Time)')
    .replace(/{formatted_appt}/g, formatAppt(date, time));
};

export const DEFAULT_TEMPLATES = [
  {
    id: 'singcapital_zoom',
    label: 'SingCapital Zoom Invite',
    content: "Hey {name}, I’m Chuan Seng here from SingCapital. As Arranged earlier,\n\nThe zoom call will be on *{formatted_appt}* below is the link for the zoom 😊👍🏻\n\nHttps://us06web.zoom.us/j/2300107843\n\n👉🏻 This Zoom session, you acknowledge and give your consent to the discussion in accordance with PDPA guidelines."
  },
  {
    id: 'default_zoom',
    label: 'Standard Zoom Confirm',
    content: "Hey {name}, I’m reaching out from Sproutly. Confirming our zoom call on *{formatted_appt}*.\n\nLink: https://zoom.us/j/sproutly-meeting 😊👍🏻"
  },
  {
    id: 'default_review',
    label: 'Strategic Review',
    content: "Hi {name}, hope you're doing well. I've finished a baseline analysis on your dossier. Do you have 10 mins this week to review the findings?"
  }
];

export const WHATSAPP_TEMPLATES = DEFAULT_TEMPLATES.map(t => ({
  ...t,
  content: (name: string, date: string, time: string) => interpolateTemplate(t.content, name, date, time)
}));
