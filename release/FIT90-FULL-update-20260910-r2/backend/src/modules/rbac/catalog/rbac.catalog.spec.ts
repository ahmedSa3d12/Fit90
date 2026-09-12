import { buildRouteMap } from './rbac.catalog';

describe('buildRouteMap', () => {
  it('maps the employees page to only its canonical permission resource', () => {
    expect(buildRouteMap()['/employees']).toEqual(['employees.list']);
  });
});
