import { EventStatus } from '@prisma/client';

export const EVENT_STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: [EventStatus.REGISTRATION_OPEN, EventStatus.ARCHIVED],
  REGISTRATION_OPEN: [
    EventStatus.SUBMISSION_OPEN,
    EventStatus.DRAFT,
    EventStatus.ARCHIVED,
  ],
  SUBMISSION_OPEN: [
    EventStatus.JUDGING,
    EventStatus.REGISTRATION_OPEN,
    EventStatus.ARCHIVED,
  ],
  JUDGING: [
    EventStatus.LEADERBOARD_FROZEN,
    EventStatus.SUBMISSION_OPEN,
    EventStatus.ARCHIVED,
  ],
  LEADERBOARD_FROZEN: [
    EventStatus.WINNERS_REVEALED,
    EventStatus.JUDGING,
    EventStatus.ARCHIVED,
  ],
  WINNERS_REVEALED: [
    EventStatus.COMPLETED,
    EventStatus.LEADERBOARD_FROZEN,
    EventStatus.ARCHIVED,
  ],
  COMPLETED: [EventStatus.ARCHIVED],
  ARCHIVED: [],
};
