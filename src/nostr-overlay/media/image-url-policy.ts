const SVG_PATH_PATTERN = /\.svgz?$/i;

export function sanitizeImageUrl(value: string | undefined | null): string | undefined {
    if (!value) {
        return undefined;
    }

    try {
        const url = new URL(value.trim());
        if (
            url.protocol !== 'https:'
            || url.username
            || url.password
            || url.hash
            || SVG_PATH_PATTERN.test(url.pathname)
        ) {
            return undefined;
        }

        return url.toString();
    } catch {
        return undefined;
    }
}
