/**
 * Tree Path Generator Utility
 * This utility module handles consistent file path generation for tree visualizations
 * based on filters, traditions, genres, and levels.
 */

/**
 * Core function to generate the correct file path based on current filters and view
 * @param {Object} options - Configuration options
 * @param {String} options.view - Current view ('traditions', 'combined', 'tradition', 'genre')
 * @param {String} options.tradition - Current tradition (e.g., 'irish', 'galician', null for combined)
 * @param {String} options.genre - Current genre (only for genre view)
 * @param {String} options.feature - Selected feature ('chromatic', 'rhythmic', 'chromatic_rhythmic')
 * @param {String} options.level - Selected level ('note', 'segment', 'structure', 'combined')
 * @returns {Object} Generated path information
 */
export function generateTreeFilePath(options) {
    const { view, tradition, genre, feature, level } = options;
    
    // 1. MAP LEVEL FILTER TO FILE PATTERN - CONSISTENT FOR ALL TREES
    let levelPattern;
    if (level === 'note') {
      levelPattern = 'note';
    } else if (level === 'segment') {
      levelPattern = 'shared_segments';
    } else if (level === 'structure') {
      levelPattern = 'structure';
    } else if (level === 'combined') {
      levelPattern = 'combined_s75_ss25';
    } else {
      // Default
      levelPattern = 'combined_s75_ss25';
    }
    
    // 2. DETERMINE THE TARGET FOLDER BASED ON VIEW TYPE
    let targetFolder;
    let targetFile;
    
    switch (view) {
      case 'combined':
        // Celtic Traditions combined view (both Irish and Galician)
        targetFolder = 'tradition_segmented/genre/both/';
        targetFile = `genre_tree_${levelPattern}_${feature}.json`;
        break;
        
      case 'tradition':
        // Specific tradition view (Irish or Galician)
        if (!tradition) {
          throw new Error('Tradition ID required for tradition view');
        }
        targetFolder = `tradition_segmented/genre/${tradition}/`;
        targetFile = `genre_tree_${levelPattern}_${feature}.json`;
        break;
        
      case 'genre':
        // Specific genre view
        if (!genre || !tradition) {
          throw new Error('Genre and tradition IDs required for genre view');
        }
        
        // Map level to folder structure
        const levelFolder = level === 'note' ? 'note_level' :
                            level === 'segment' ? 'shared_segments' :
                            level === 'structure' ? 'structure_level' :
                            'combined';
                            
        targetFolder = `genre_segmented/${levelFolder}/${tradition}/${genre}/`;
        targetFile = `${levelFolder}_${feature}_phylogenetic_tree.json`;
        break;
        
      case 'traditions':
      default:
        // Top level traditions view - no specific file pattern 
        targetFolder = '';
        targetFile = 'traditions_tree.json';
    }
    
    // 3. DETERMINE BASE PATHS BASED ON ENVIRONMENT
    const isProduction = window.location.hostname !== 'localhost' && 
                       window.location.hostname !== '127.0.0.1';
    
    const basePaths = isProduction ? [
      `${import.meta.env.BASE_URL}preprocessed_data/`,
      `${import.meta.env.BASE_URL}dist/preprocessed_data/`,
      `${import.meta.env.BASE_URL}`,
      `${import.meta.env.BASE_URL}dist/`
    ] : [
      './preprocessed_data/',
      '../preprocessed_data/',
      'preprocessed_data/',
      './',
      '../'
    ];
    
    return {
      view,
      tradition,
      genre,
      feature,
      level,
      targetFolder,
      targetFile,
      levelPattern,
      basePaths,
      // Return full paths to try
      fullPaths: basePaths.map(base => `${base}${targetFolder}${targetFile}`)
    };
  }
  
  /**
   * Get the best file path for the current view and filters
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} The best file path and data
   */
  export async function getBestTreeFilePath(options) {
    // Get the path information
    const pathInfo = generateTreeFilePath(options);
    console.log(`Generated path info:`, pathInfo);
    
    // Try each base path
    for (const basePath of pathInfo.basePaths) {
      const fullPath = `${basePath}${pathInfo.targetFolder}${pathInfo.targetFile}`;
      try {
        console.log(`Trying path: ${fullPath}`);
        const response = await fetch(fullPath, { cache: 'no-cache' });
        
        if (response.ok) {
          console.log(`✅ Success with path: ${fullPath}`);
          return {
            ...pathInfo,
            workingPath: fullPath
          };
        }
      } catch (err) {
        console.log(`❌ Error with path: ${fullPath}`, err.message);
      }
    }
    
    // If we get here, no path worked
    throw new Error(`Could not find tree file for ${options.view} view`);
  }
  
  /**
   * Load and fetch tree data with the correct file path
   * @param {Object} options - Configuration options 
   * @returns {Promise<Object>} The tree data
   */
  export async function loadTreeData(options) {
    try {
      // Get the best file path
      const pathInfo = await getBestTreeFilePath(options);
      
      // Fetch the data
      const response = await fetch(pathInfo.workingPath, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`Failed to load tree data: ${response.status}`);
      }
      
      const data = await response.json();
      
      return {
        ...pathInfo,
        data
      };
    } catch (err) {
      console.error('Error loading tree data:', err);
      throw err;
    }
  }
  
  /**
   * Factory for generating file paths for multiple combinations
   * @param {Object} baseOptions - Base configuration options
   * @returns {Object[]} Generated path combinations
   */
  export function generateFilePathCombinations(baseOptions) {
    const features = ['chromatic', 'rhythmic', 'chromatic_rhythmic'];
    const levels = ['note', 'segment', 'structure', 'combined'];
    
    const combinations = [];
    
    for (const feature of features) {
      for (const level of levels) {
        combinations.push({
          ...baseOptions,
          feature,
          level,
          filePath: generateTreeFilePath({ 
            ...baseOptions, 
            feature, 
            level 
          })
        });
      }
    }
    
    return combinations;
  }
  
  /**
   * Verify if file exists at path
   * @param {String} path - File path to check
   * @returns {Promise<Boolean>} Whether file exists
   */
  export async function verifyFileExists(path) {
    try {
      const response = await fetch(path, { 
        method: 'HEAD', 
        cache: 'no-cache' 
      });
      return response.ok;
    } catch (err) {
      return false;
    }
  }
  
  /**
   * Check and verify all file combinations for a given view
   * @param {Object} baseOptions - Base configuration options
   * @returns {Promise<Object[]>} Results with exists property
   */
  export async function verifyAllFileCombinations(baseOptions) {
    const combinations = generateFilePathCombinations(baseOptions);
    
    const results = [];
    
    for (const combo of combinations) {
      // Check the first path in fullPaths
      const exists = combo.filePath.fullPaths.length > 0 ? 
                   await verifyFileExists(combo.filePath.fullPaths[0]) : 
                   false;
      
      results.push({
        ...combo,
        exists
      });
    }
    
    return results;
  }
  
  /**
   * Helper to get human-readable display names
   * @param {String} level - Level code
   * @param {String} feature - Feature code
   * @returns {Object} Display names
   */
  export function getDisplayNames(level, feature) {
    const levelDisplay = {
      'note': 'Note Level',
      'segment': 'Shared Phrases (S)',
      'structure': 'Form (F)',
      'combined': 'Combined'
    };
    
    const featureDisplay = {
      'chromatic': 'Chromatic',
      'rhythmic': 'Rhythmic',
      'chromatic_rhythmic': 'Chromatic & Rhythmic'
    };
    
    return {
      levelDisplay: levelDisplay[level] || level,
      featureDisplay: featureDisplay[feature] || feature
    };
  }
  
  /**
   * Debug utilities for tree file paths
   */
  export const debugUtils = {
    /**
     * Generate debug report for current settings
     * @param {Object} options - Current view options
     * @returns {String} Debug report
     */
    generateReport(options) {
      const pathInfo = generateTreeFilePath(options);
      const { levelDisplay, featureDisplay } = getDisplayNames(options.level, options.feature);
      
      return `
        ===== TREE PATH DEBUG =====
        View: ${options.view}
        ${options.tradition ? `Tradition: ${options.tradition}` : ''}
        ${options.genre ? `Genre: ${options.genre}` : ''}
        
        Feature: ${options.feature} (${featureDisplay})
        Level: ${options.level} (${levelDisplay})
        
        Target Folder: ${pathInfo.targetFolder}
        Target File: ${pathInfo.targetFile}
        
        Full Paths to try:
        ${pathInfo.fullPaths.map(p => `- ${p}`).join('\n')}
        ==========================
      `;
    },
    
    /**
     * Log debug report to console
     * @param {Object} options - Current view options
     */
    logReport(options) {
      console.group('Tree Path Debug Report');
      console.log(this.generateReport(options));
      console.groupEnd();
    }
  };
  
  /**
   * Real-time tree updater - use this to update trees on filter/view changes
   * @param {Function} renderFunction - Function to call with tree data
   * @returns {Function} Function to call when filters change
   */
  export function createTreeUpdater(renderFunction) {
    return async function updateTree(options) {
      try {
        const result = await loadTreeData(options);
        renderFunction(result.data, result);
        return {
          success: true,
          data: result.data,
          pathInfo: result
        };
      } catch (err) {
        console.error('Error updating tree:', err);
        return {
          success: false,
          error: err.message,
          pathInfo: generateTreeFilePath(options)
        };
      }
    };
  }
  
  /**
   * Helper function to determine the tradition for a genre
   * @param {String} genre - Genre to look up
   * @param {Object} traditions - Traditions configuration
   * @returns {String|null} Tradition ID or null if not found
   */
  export function getTraditionForGenre(genre, traditions) {
    if (!genre) return null;
    
    for (const [id, tradition] of Object.entries(traditions)) {
      if (tradition.genres.includes(genre.toLowerCase())) {
        return id;
      }
    }
    
    return null;
  }