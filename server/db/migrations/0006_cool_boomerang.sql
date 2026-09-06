-- Story 17.9 — retrait du périmètre forecast résiduel.
--
-- `dismissed_suggestions` servait le suggérateur de charges récurrentes (story 5.2), descopé
-- par le pivot du 2026-09-04. Ni endpoint, ni composant, ni service ne la lisaient depuis :
-- seule sa propre suite de tests la maintenait en vie. CLAUDE.md affirmait que l'ancien
-- périmètre avait été « entièrement supprimé du code » — ce commit rend cette phrase vraie.
--
-- Si le suggérateur revient (story 18.x, FR38), il reviendra avec sa table.
DROP TABLE `dismissed_suggestions`;