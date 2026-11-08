/* Blue Shelf: up to 3 genres per book, without changing reading progress.
 * Legacy "genre" stays as the primary value for older views and imports.
 */
(function(){
'use strict';
function cleaned(values){
 const result=[],keys=new Set();
 for(const item of values){
  const genre=String(item||'').trim().replace(/\s+/g,' ').slice(0,80);
  if(!genre)continue;
  const key=genre.toLocaleLowerCase();
  if(!keys.has(key)){keys.add(key);result.push(genre)}
  if(result.length===3)break;
 }
 return result;
}
window.bsGenresClean=cleaned;
window.bsGenresOf=function(book){
 if(!book||typeof book!=='object')return [];
 const raw=Array.isArray(book.genres)?book.genres:[];
 return cleaned([book.genre,...raw]);
};
window.bsGenresFromForm=function(formData){
 return cleaned(['genre','genre2','genre3'].map(field=>formData.get(field)));
};
// Parent genres are for aggregating statistics only: do not add a redundant
// parent tag to every book that already has a detailed subgenre.
window.bsGenreParentOf=function(genre){
 return typeof window.bsGenreParent==='function'?window.bsGenreParent(genre):genre;
};
})();
