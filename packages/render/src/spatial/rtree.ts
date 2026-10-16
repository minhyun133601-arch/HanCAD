import { boundsIntersect } from '../display/bounds';
import type { Bounds2 } from '../display/types';

interface Node<T> extends Bounds2 {
  leaf: boolean;
  children: (Node<T> | T)[];
}
const emptyBounds = (): Bounds2 => ({
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
});
const area = (bounds: Bounds2) =>
  Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxY - bounds.minY);
function extend(a: Bounds2, b: Bounds2): void {
  a.minX = Math.min(a.minX, b.minX);
  a.minY = Math.min(a.minY, b.minY);
  a.maxX = Math.max(a.maxX, b.maxX);
  a.maxY = Math.max(a.maxY, b.maxY);
}
function enlarged(a: Bounds2, b: Bounds2): number {
  return (
    (Math.max(a.maxX, b.maxX) - Math.min(a.minX, b.minX)) *
      (Math.max(a.maxY, b.maxY) - Math.min(a.minY, b.minY)) -
    area(a)
  );
}

/** Dynamic R-tree with packed, balanced OMT bulk construction and local splits. */
export class RTree<T extends Bounds2> {
  private root: Node<T> = { ...emptyBounds(), leaf: true, children: [] };
  private count = 0;
  readonly maxEntries: number;
  constructor(maxEntries = 16) {
    this.maxEntries = Math.max(4, Math.trunc(maxEntries));
  }
  get size(): number {
    return this.count;
  }
  clear(): void {
    this.root = { ...emptyBounds(), leaf: true, children: [] };
    this.count = 0;
  }
  bulkLoad(items: readonly T[]): void {
    for (const item of items) this.validate(item);
    this.count = items.length;
    const height = Math.max(
      1,
      Math.ceil(Math.log(Math.max(1, items.length)) / Math.log(this.maxEntries)),
    );
    this.root = this.build([...items], height);
  }
  load(items: readonly T[]): void {
    this.bulkLoad(items);
  }
  insert(item: T): void {
    this.validate(item);
    const path: Node<T>[] = [],
      current = this.root;
    let node = current;
    while (!node.leaf) {
      path.push(node);
      let best: Node<T> | undefined,
        growth = Infinity,
        smallest = Infinity;
      for (const child of node.children as Node<T>[]) {
        const candidate = enlarged(child, item),
          childArea = area(child);
        if (candidate < growth || (candidate === growth && childArea < smallest)) {
          best = child;
          growth = candidate;
          smallest = childArea;
        }
      }
      node = best!;
    }
    path.push(node);
    node.children.push(item);
    this.count++;
    for (let level = path.length - 1; level >= 0; level--) {
      const currentNode = path[level]!;
      this.recalculate(currentNode);
      if (currentNode.children.length <= this.maxEntries) continue;
      const sibling = this.split(currentNode);
      if (level) path[level - 1]!.children.push(sibling);
      else {
        this.root = { ...emptyBounds(), leaf: false, children: [currentNode, sibling] };
        this.recalculate(this.root);
      }
    }
  }
  remove(item: T): boolean {
    const visit = (node: Node<T>): boolean => {
      if (!boundsIntersect(node, item)) return false;
      if (node.leaf) {
        const index = node.children.indexOf(item);
        if (index < 0) return false;
        node.children.splice(index, 1);
        this.recalculate(node);
        return true;
      }
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i] as Node<T>;
        if (visit(child)) {
          if (!child.children.length) node.children.splice(i, 1);
          this.recalculate(node);
          return true;
        }
      }
      return false;
    };
    if (!visit(this.root)) return false;
    this.count--;
    while (!this.root.leaf && this.root.children.length === 1)
      this.root = this.root.children[0] as Node<T>;
    if (!this.count) this.clear();
    return true;
  }
  search(bounds: Bounds2): T[] {
    const result: T[] = [],
      stack = [this.root];
    while (stack.length) {
      const node = stack.pop()!;
      if (!boundsIntersect(node, bounds)) continue;
      for (const child of node.children) {
        if (!boundsIntersect(child as Bounds2, bounds)) continue;
        if (node.leaf) result.push(child as T);
        else stack.push(child as Node<T>);
      }
    }
    return result;
  }
  all(): T[] {
    return this.search({ minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity });
  }
  private build(items: T[], height: number): Node<T> {
    const node: Node<T> = { ...emptyBounds(), leaf: height === 1, children: [] };
    if (node.leaf) node.children = items;
    else {
      const capacity = this.maxEntries ** (height - 1),
        groups = Math.ceil(items.length / capacity);
      const slabSize = Math.ceil(groups / Math.ceil(Math.sqrt(groups))) * capacity;
      items.sort((a, b) => a.minX - b.minX);
      for (let slab = 0; slab < items.length; slab += slabSize) {
        const sorted = items.slice(slab, slab + slabSize).sort((a, b) => a.minY - b.minY);
        for (let i = 0; i < sorted.length; i += capacity)
          node.children.push(this.build(sorted.slice(i, i + capacity), height - 1));
      }
    }
    this.recalculate(node);
    return node;
  }
  private split(node: Node<T>): Node<T> {
    const axis = node.maxX - node.minX >= node.maxY - node.minY ? 'minX' : 'minY';
    node.children.sort((a, b) => (a as Bounds2)[axis] - (b as Bounds2)[axis]);
    const sibling: Node<T> = {
      ...emptyBounds(),
      leaf: node.leaf,
      children: node.children.splice(Math.ceil(node.children.length / 2)),
    };
    this.recalculate(node);
    this.recalculate(sibling);
    return sibling;
  }
  private recalculate(node: Node<T>): void {
    Object.assign(node, emptyBounds());
    for (const child of node.children) extend(node, child as Bounds2);
  }
  private validate(item: T): void {
    if (
      ![item.minX, item.minY, item.maxX, item.maxY].every(Number.isFinite) ||
      item.minX > item.maxX ||
      item.minY > item.maxY
    )
      throw new Error('Invalid finite R-tree bounds');
  }
}
