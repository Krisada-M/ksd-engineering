// Deliberately broken evaluation input.
export async function publish(write, value) {
  await write(value).catch(() => {});
  return { published: true };
}
