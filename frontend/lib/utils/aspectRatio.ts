export function getAspectClass(aspectRatio: '16:9' | '9:16'): string {
  // Using custom .aspect-vertical class defined in globals.css to avoid Tailwind JIT issues with aspect-[9/16]
  return aspectRatio === '16:9' ? 'aspect-video' : 'aspect-vertical';
}

export function getGridClass(aspectRatio: '16:9' | '9:16', context: 'project' | 'box' = 'project'): string {
  if (context === 'box') {
    // Inside box: vertical assets need more columns so they don't become thin strips
    return aspectRatio === '16:9'
      ? 'grid-cols-2'
      : 'grid-cols-3';
  }
  
  // Project page: vertical scenes need more columns
  return aspectRatio === '16:9'
    ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
    : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';
}
