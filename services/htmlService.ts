// A set of tags that are allowed to be present in the sanitized HTML.
const ALLOWED_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'P', 'BR', 'B', 'STRONG', 'U', 'SPAN']);
// A set of CSS style properties that are allowed.
const ALLOWED_STYLES = new Set(['font-size', 'text-align', 'font-weight', 'text-decoration']);

/**
 * Recursively cleans a DOM node, removing disallowed tags, attributes, and styles.
 * @param node The DOM node to clean.
 */
const cleanNode = (node: Node) => {
    // Process children first, iterating backwards to safely remove nodes.
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
        cleanNode(node.childNodes[i]);
    }

    if (node.nodeType === 1) { // Element node
        const element = node as Element;
        const tagName = element.tagName;

        // 1. Remove dangerous or unwanted tags entirely (e.g., scripts, images).
        if (['SCRIPT', 'STYLE', 'IMG', 'VIDEO', 'AUDIO', 'IFRAME', 'LINK'].includes(tagName)) {
            element.remove();
            return;
        }

        // 2. For all other tags, if not in the allowed list, unwrap them (keep children).
        if (!ALLOWED_TAGS.has(tagName)) {
            element.replaceWith(...element.childNodes);
            return;
        }

        // 3. Remove all attributes except 'style'.
        const attrsToRemove = Array.from(element.attributes)
            .map(attr => attr.name)
            .filter(name => name.toLowerCase() !== 'style');
        attrsToRemove.forEach(name => element.removeAttribute(name));

        // 4. Sanitize the 'style' attribute.
        if (element.hasAttribute('style')) {
            const styleDecl = (element as HTMLElement).style;
            const newCssText: string[] = [];
            
            for (let i = 0; i < styleDecl.length; i++) {
                const prop = styleDecl[i];
                if (ALLOWED_STYLES.has(prop)) {
                    // Specific checks for allowed values
                    if (prop === 'font-weight' && !['bold', '700', 'normal', '400'].includes(styleDecl.fontWeight)) continue;
                    if (prop === 'text-decoration' && !styleDecl.textDecoration.includes('underline')) continue;
                    
                    newCssText.push(`${prop}: ${styleDecl.getPropertyValue(prop)}`);
                }
            }

            if (newCssText.length > 0) {
                element.setAttribute('style', newCssText.join('; '));
            } else {
                element.removeAttribute('style');
            }
        }
    }
};

/**
 * Sanitizes an HTML string to allow only a safe subset of tags and styles.
 * Preserves formatting for line breaks, font size, text alignment, bold, and underline.
 * @param html The raw HTML string to sanitize.
 * @returns A sanitized HTML string.
 */
export const sanitizeHtml = (html: string): string => {
    if (!html) { // Handle empty, null, or undefined input gracefully.
        return '';
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    // Defensive check: DOMParser with 'text/html' should always create a body, but it's safer to check.
    if (!doc.body) {
        return '';
    }

    // Instead of cleaning the body tag itself (which causes it to be removed),
    // iterate over its children and clean them individually. This prevents
    // `doc.body` from becoming null before it's used later.
    for (let i = doc.body.childNodes.length - 1; i >= 0; i--) {
        cleanNode(doc.body.childNodes[i]);
    }

    // Post-processing to ensure semantic tags also have their corresponding style for consistency.
    doc.body.querySelectorAll('b, strong').forEach(el => {
        (el as HTMLElement).style.fontWeight = 'bold';
    });
    doc.body.querySelectorAll('u').forEach(el => {
        (el as HTMLElement).style.textDecoration = 'underline';
    });

    return doc.body.innerHTML;
};