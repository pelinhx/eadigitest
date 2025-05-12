/**
 * Creates a D3 link path between two nodes
 */
export function createLinkPath(d) {
    return "M" + d.source.y + "," + d.source.x
      + "C" + (d.source.y + d.target.y) / 2 + "," + d.source.x
      + " " + (d.source.y + d.target.y) / 2 + "," + d.target.x
      + " " + d.target.y + "," + d.target.x;
  }
  
  /**
   * Gets the tradition that a genre belongs to
   */
  export function getTraditionForGenre(genre, traditions) {
    if (!genre) return null;
    const genreLower = genre.toLowerCase();
    for (const [tradition, data] of Object.entries(traditions)) {
      if (data.genres.includes(genreLower)) return { name: tradition, ...data };
    }
    return null;
  }
  
  /**
   * Generic tree traversal function
   */
  export function traverseTree(node, callback, parentInfo = {}) {
    if (!node) return;
    
    callback(node, parentInfo);
    
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(child => traverseTree(child, callback, {
        genre: node.genre,
        tradition: node.tradition
      }));
    }
  }
  
  /**
   * Process tree data to ensure all nodes have correct properties
   */
  export function processTreeData(data, currentView, traditions) {
    if (!data) return data;
    
    // Deep copy to avoid mutating the original
    const treeCopy = JSON.parse(JSON.stringify(data));
    
    traverseTree(treeCopy, (node, parentInfo) => {
      // Apply parent genre/tradition if not present
      if (parentInfo.genre && !node.genre) node.genre = parentInfo.genre;
      if (parentInfo.tradition && !node.tradition) node.tradition = parentInfo.tradition;
      
      // Process display name
      if (node.name && !node.display_name) {
        if (node.name.includes('.krn')) {
          const parts = node.name.split('_');
          if (parts.length >= 3) {
            const displayName = parts.slice(2)
              .join(' ')
              .replace(/\.krn$/, '')
              .replace(/_/g, ' ');
            node.display_name = displayName.charAt(0).toUpperCase() + displayName.slice(1);
          } else {
            node.display_name = node.name.replace(/\.krn$/, '');
          }
        } else {
          node.display_name = node.name;
        }
      }
    });
    
    return treeCopy;
  }