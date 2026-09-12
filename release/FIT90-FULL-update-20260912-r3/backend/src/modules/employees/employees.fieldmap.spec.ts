import { formToData, rowToForm } from './employees.fieldmap';

describe('employees field map', () => {
  it('maps target and commission to decimal employee columns', () => {
    expect(formToData({ employee_target: '12000.50', employee_commission: '7.25' })).toEqual({
      employee_target: 12000.5,
      employee_commission: 7.25,
    });
  });

  it('returns saved commission when editing an employee', () => {
    const form = rowToForm({ employee_target: 9000, employee_commission: 5 });
    expect(form.employee_target).toBe('9000');
    expect(form.employee_commission).toBe('5');
  });
});
