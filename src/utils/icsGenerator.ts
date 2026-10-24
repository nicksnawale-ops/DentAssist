import { format } from 'date-fns';

interface ICSData {
  title: string;
  description: string;
  location: string;
  startDate: Date;
  endDate: Date;
}

export function generateICS({ title, description, location, startDate, endDate }: ICSData): string {
  const formatDateICS = (date: Date) => {
    return format(date, "yyyyMMdd'T'HHmmss");
  };

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//VisionEdge DentAssist Dental//NONSGML v1.0//EN
BEGIN:VEVENT
UID:${new Date().getTime()}@visionedge.com
DTSTAMP:${formatDateICS(new Date())}Z
DTSTART:${formatDateICS(startDate)}
DTEND:${formatDateICS(endDate)}
SUMMARY:${title}
DESCRIPTION:${description}
LOCATION:${location}
END:VEVENT
END:VCALENDAR`;
}
