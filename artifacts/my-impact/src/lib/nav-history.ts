let _previousLocation: string | null = null;
let _currentLocation: string | null = null;

export function updateNavHistory(location: string): void {
  if (_currentLocation !== location) {
    _previousLocation = _currentLocation;
    _currentLocation = location;
  }
}

export function getPreviousLocation(): string | null {
  return _previousLocation;
}
