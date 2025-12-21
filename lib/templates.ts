
import { convert24to12 } from './helpers';

// Helper to format date into "Saturday ( 10 Dec @ 12 pm )"
export const formatAppt = (dateStr: string | null, timeStr?: string | null) => {
  if (!dateStr || dateStr === 'undefined' || dateStr === '') return '( Date @ Time )';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '( Date @ Time )';
    const weekday = date.toLocaleDateString('en-SG', { weekday: 'long' });
    const day = date.getDate();
    const month = date.toLocaleDateString('en-SG', { month: 'short' });
    const time = timeStr ? convert24to12(timeStr) : '12 pm';
    return `${weekday} ( ${day} ${month} @ ${time} )`;
  } catch (e) {
    return '( Date @ Time )';
  }
};

/**
 * Replaces placeholders like {name}, {date}, {time} with actual client data
 */
export const interpolateTemplate = (content: string, name: string, date: string, time: string) => {
  return content
    .replace(/{name}/g, name || 'there')
    .replace(/{date}/g, date || '(Date)')
    .replace(/{time}/g, time ? convert24to12(time) : '(Time)')
    .replace(/{formatted_appt}/g, formatAppt(date, time));
};

export const DEFAULT_TEMPLATES = [
  {
    id: 'default_zoom',
    label: 'Zoom Confirmation',
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
