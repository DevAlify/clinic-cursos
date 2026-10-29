// Fictitious people and numbers. Brazil is UTC-3 all year.
export const brt = (local: string): string => new Date(`${local}:00-03:00`).toISOString();

export const NUMBERS = { sp: '551130000001', rj: '552130000002', cps: '551930000003' } as const;

export const PEOPLE = {
  ana: { name: 'Ana Lima', phone: '(11) 98765-0001', waId: '551187650001', bsuid: 'BR.ANA0001', email: 'ana.lima@example.com' },
  carla: { name: 'Carla Mendes', waId: '5521988880002', bsuid: 'BR.CARLA0002' },
  daniel: { name: 'Daniel Rocha', waId: '5519977770003', bsuid: 'BR.DANIEL0003' },
  bruna: { name: 'Bruna Souza', phone: '(19) 96666-0004', email: 'bruna.souza@example.com', erpPatientId: 'PAC-0042' },
  eduardo: { name: 'Eduardo Alves', phone: '+55 11 95555-0005', email: 'eduardo.alves@example.com' },
  felipe: { name: 'Felipe Costa', phone: '(19) 94444-0006', email: 'felipe.costa@example.com' },
  gabriela: { name: 'Gabriela Nunes', phone: '(19) 94444-0007', email: 'gabriela.nunes@example.com' },
  helena: { name: 'Helena Prado', phone: '(19) 94444-0008', waId: '5519944440008', email: 'helena.prado@example.com' },
} as const;

export const CAMPAIGNS = { spHof: 'sp_hof_captacao_202610', cpsHof: 'cps_hof_captacao_202610', rjCursos: 'rj_cursos_divulgacao_202610' } as const;
export const QR_CODE = 'K7P2';
export const QR_TEXT = 'Olá! Vi o cartaz na recepção e quero saber dos cursos (cód. K7P2)';
// WAHA message ids embed the sender's number, like real ones do.
export const CARLA_FIRST_MESSAGE_ID = `false_${PEOPLE.carla.waId}@c.us_3EB0CARLA1`;
// Fragments that must never appear in the log: personal data and conversation text.
export const SECRETS_IN_FIXTURES = [
  ...Object.values(PEOPLE).map((p) => p.name),
  'ana.lima@', 'bruna.souza@', 'eduardo.alves@', 'felipe.costa@', 'gabriela.nunes@', 'helena.prado@',
  '87650001', '88880002', '77770003', '66660004', '55550005', '44440006', '44440007', '44440008',
  'cartaz na recepção', 'turma de novembro', 'quanto custa', 'inscrever na turma',
];
