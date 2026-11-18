/**
 * Seuils de qualité du produit.
 *
 * NFR22 : ces valeurs ne sont pas écrites en dur dans une fonction de calcul ni dans un
 * rendu — elles vivent ici, où on peut les discuter.
 */

/**
 * Taux maximal de lignes reprises à la main sur un relevé, au-delà duquel la catégorisation
 * automatique ne tient pas sa promesse.
 *
 * Ce n'est pas un confort d'affichage : c'est le **jalon de décision du MVP**. Au-dessus,
 * la corvée que le produit devait supprimer est de retour, et l'utilisateur décrochera comme
 * il a décroché de son tableur. La construction des vues d'analyse s'arrête tant que ce seuil
 * n'est pas tenu.
 */
export const MANUAL_CORRECTION_THRESHOLD = 0.1
