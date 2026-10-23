import { Fragment } from 'react';

/** Text stays escaped by React; only explicit web URLs become links. */
export function MessageBody({ body }: { body: string }) {
  return body.split(/(https?:\/\/[^\s<>]+)/gi).map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return <Fragment key={index}>{part}</Fragment>;
    const url = part.replace(/[.,!?;:)]+$/, '');
    return <Fragment key={index}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a>{part.slice(url.length)}</Fragment>;
  });
}
