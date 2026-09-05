export const forceMotionInDevelopment =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_FORCE_MOTION === "true";

export function shouldReduceMotion(mediaQuery: MediaQueryList): boolean {
  return !forceMotionInDevelopment && mediaQuery.matches;
}
