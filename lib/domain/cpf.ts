export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizeCpf(cpf: string): string {
  return onlyDigits(cpf).slice(0, 11);
}

export function formatCpf(cpf: string): string {
  const digits = normalizeCpf(cpf);
  if (digits.length !== 11) return cpf.trim();
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function isValidCpf(cpf: string): boolean {
  const digits = normalizeCpf(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === Number(digits[10]);
}

export function maskCpf(cpf: string): string {
  const digits = normalizeCpf(cpf);
  if (digits.length !== 11) return '***.***.***-**';
  return `***.***.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function maskRg(rg: string): string {
  const clean = rg.trim();
  if (!clean) return 'Não informado';
  if (clean.length <= 3) return '***';
  return `${'*'.repeat(Math.max(3, clean.length - 3))}${clean.slice(-3)}`;
}

export function formatPhoneBr(phone: string): string {
  const digits = onlyDigits(phone);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone.trim();
}

export function formatCep(cep: string): string {
  const digits = onlyDigits(cep).slice(0, 8);
  if (digits.length === 8) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return cep.trim();
}

export function formatCurrencyBr(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDateBr(isoDate: string): string {
  if (!isoDate) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('pt-BR');
}
