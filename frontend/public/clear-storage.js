/**
 * Clear Browser Storage Script
 * 
 * This script helps clear localStorage and other browser storage
 * to ensure clean database migration.
 */

console.log(' Clearing browser storage...');

// Clear localStorage
if (typeof localStorage !== 'undefined') {
  console.log(' Current localStorage items:');
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    console.log(`  - ${key}`);
  }
  
  // Clear old problematic items
  const itemsToRemove = [
    'clearedActivities',
    'clearedResults', 
    'crawlerResults',
    'sqlite_database'
  ];
  
  itemsToRemove.forEach(item => {
    if (localStorage.getItem(item)) {
      localStorage.removeItem(item);
      console.log(`✅ Removed ${item}`);
    }
  });
  
  localStorage.clear();
  console.log('✅ Cleared all localStorage');
}

// Clear sessionStorage
if (typeof sessionStorage !== 'undefined') {
  sessionStorage.clear();
  console.log('✅ Cleared sessionStorage');
}

console.log(' Storage cleared! Please refresh the page.');
