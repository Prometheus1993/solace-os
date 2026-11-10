import type { DashboardDTO } from '@solace/core';
export type AvatarMood = 'neutral' | 'sleepy' | 'drained' | 'recovering' | 'alert';
export type AvatarSignals = Pick<DashboardDTO, 'recovery' | 'hrv' | 'dataFreshness'>;
/** Cosmetic idle selection only; never changes coaching or training recommendations. */
export function avatarState(dto: AvatarSignals): { mood: AvatarMood; label: string } {
  const { sleep, bodyBattery, hrv } = dto.recovery.today;
  if (dto.dataFreshness.recoveryDaysStale == null || dto.dataFreshness.recoveryDaysStale > 0)
    return { mood: 'neutral', label: 'NEUTRAL · WAITING FOR TODAY’S SIGNALS' };
  const lowSleep = sleep != null && Number.isFinite(sleep) && sleep < 60;
  const lowBattery = bodyBattery != null && Number.isFinite(bodyBattery) && bodyBattery < 25;
  // Compare normalized deficits when both cosmetic triggers are present; battery wins ties.
  if (lowBattery && (!lowSleep || (25 - bodyBattery) / 25 >= (60 - sleep) / 60))
    return { mood: 'drained', label: 'LOW BATTERY · SLOW IDLE' };
  if (lowSleep) return { mood: 'sleepy', label: 'LOW SLEEP · DROWSY IDLE' };
  if (hrv != null && hrv > 0 && dto.hrv.todayFlag === 'low')
    return { mood: 'recovering', label: 'HRV BELOW BASELINE · RECOVERY IDLE' };
  if (sleep != null && sleep >= 80 && bodyBattery != null && bodyBattery >= 70 && dto.hrv.todayFlag === 'normal')
    return { mood: 'alert', label: 'RECHARGED · ALERT IDLE' };
  return { mood: 'neutral', label: 'NEUTRAL IDLE' };
}
