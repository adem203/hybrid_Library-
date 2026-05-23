import {
  buildLoanFacets,
  getMatchedVisibleFacet,
  getVisibleSearchMode,
  loanMatchesQuery,
  normalizeSearch,
} from './EmpruntsView';

const rows = [
  {
    id_emprunt: 19,
    id_user: 6,
    id_livre: 7,
    matricule: 'ETU-2026-0006',
    role: 'ETUDIANT',
    prenom: 'dgdsgsd',
    nom: 'vdsgds',
    email: 'other@example.test',
    titre: 'Questions of Human Nature',
    auteur: 'Sofia Martin',
    isbn: '970000000007',
    statut: 'RETOURNE',
    user: {
      prenom: 'adem',
      nom: 'laadhari',
      matricule: 'ETU-2026-0001',
    },
    reservation: {
      user: {
        prenom: 'adem',
        nom: 'laadhari',
      },
    },
    createdBy: {
      prenom: 'adem',
      nom: 'laadhari',
    },
    updatedBy: {
      prenom: 'adem',
      nom: 'laadhari',
    },
  },
  {
    id_emprunt: 18,
    id_user: 1,
    id_livre: 6,
    matricule: 'ETU-2026-0001',
    role: 'ETUDIANT',
    prenom: 'adem',
    nom: 'laadhari',
    email: 'adem@example.test',
    titre: 'Ancient North African History',
    auteur: 'Yasmine Wilson',
    isbn: '970000000006',
    statut: 'RETOURNE',
  },
  {
    id_emprunt: 13,
    id_user: 1,
    id_livre: 4,
    matricule: 'ETU-2026-0001',
    role: 'ETUDIANT',
    prenom: 'adem',
    nom: 'laadhari',
    email: 'adem@example.test',
    titre: 'Smart French Grammar',
    auteur: 'Youssef Anderson',
    isbn: '970000000004',
    statut: 'REFUSE',
  },
  {
    id_emprunt: 22,
    id_user: 5,
    id_livre: 2,
    matricule: 'ETU-2026-0005',
    role: 'ETUDIANT',
    prenom: 'saleh',
    nom: 'mansour',
    email: 'saleh@example.test',
    titre: 'Database Systems',
    auteur: 'Adem Laadhari',
    isbn: '970000000002',
    statut: 'EN_COURS',
  },
];

function filterRows(query, sourceRows = rows) {
  const normalizedQuery = normalizeSearch(query);
  const terms = normalizedQuery.split(' ').filter(Boolean);
  const mode = getVisibleSearchMode(sourceRows, terms);

  return sourceRows.filter(row => (
    loanMatchesQuery(row, terms, mode)
  ));
}

describe('EmpruntsView search facets', () => {
  test('exact visible borrower full name returns only that borrower', () => {
    const result = filterRows('adem laadhari');

    expect(result.map(row => row.id_emprunt)).toEqual([18, 13]);
  });

  test('EMP-019 does not match adem laadhari through hidden users or other groups', () => {
    const query = 'adem laadhari';
    const terms = normalizeSearch(query).split(' ').filter(Boolean);
    const result = filterRows(query);

    expect(result.map(row => row.id_emprunt)).not.toContain(19);
    expect(getMatchedVisibleFacet(rows[0], terms)).toBe(null);
  });

  test('EMP-019 matches its visible borrower full name', () => {
    const result = filterRows('dgdsgsd vdsgds');

    expect(result.map(row => row.id_emprunt)).toEqual([19]);
  });

  test('borrower full name ignores hidden unrelated users', () => {
    const wrongRowFacets = buildLoanFacets(rows[0]);

    expect(wrongRowFacets.borrowerFacet).not.toMatch(/adem/i);
    expect(wrongRowFacets.borrowerFacet).not.toMatch(/laadhari/i);
    expect(filterRows('adem laadhari')).not.toContain(rows[0]);
  });

  test('borrower partial name is borrower-only when it matches visible borrowers', () => {
    const result = filterRows('saleh');

    expect(result.map(row => row.id_emprunt)).toEqual([22]);
  });

  test('borrower matricule returns only that borrower rows', () => {
    const result = filterRows('ETU-2026-0001');

    expect(result.map(row => row.id_emprunt)).toEqual([18, 13]);
  });

  test('loan code search still works', () => {
    const result = filterRows('EMP-019');

    expect(result.map(row => row.id_emprunt)).toEqual([19]);
  });

  test('book title search still works when query is not a borrower match', () => {
    const result = filterRows('Questions of Human Nature');

    expect(result.map(row => row.id_emprunt)).toEqual([19]);
  });

  test('ISBN search still works', () => {
    const result = filterRows('970000000007');

    expect(result.map(row => row.id_emprunt)).toEqual([19]);
  });

  test('extra spaces do not change borrower matching', () => {
    const result = filterRows('   adem     laadhari   ');

    expect(result.map(row => row.id_emprunt)).toEqual([18, 13]);
  });
});
