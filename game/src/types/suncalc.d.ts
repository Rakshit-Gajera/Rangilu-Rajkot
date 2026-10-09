/** suncalc 2.x API (degrees; azimuth is clockwise from north). The DefinitelyTyped package describes 1.x. */
declare module 'suncalc' {
  export interface Position { azimuth: number; altitude: number }
  export function getPosition(date: Date, lat: number, lng: number): Position;
  export function getMoonPosition(date: Date, lat: number, lng: number): Position & { distance: number };
  export function getTimes(date: Date, lat: number, lng: number): Record<string, Date | null> & { sunset: Date | null };
}
