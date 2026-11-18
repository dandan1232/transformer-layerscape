export const WELCOME_TOUR_STORAGE_KEY = 'transformer-layerscape:tour-dismissed'

export function isWelcomeTourDismissed() {
  try {
    return localStorage.getItem(WELCOME_TOUR_STORAGE_KEY) === 'true'
  } catch {
    return true
  }
}
