import type { RawSource } from '../usage/usageCells.js';
import { type RelationshipGraph } from './graphTypes.js';
/**
 * The relationship graph of `files`: each model, dictionary and MAT-file a box, each file one of
 * them references and that is not among them a ghost box, and the edges between them and between
 * their blocks and variables. Projects and files of other kinds draw nothing.
 *
 * A file's `path` decides how it is read; its `uriString` is its box's id and `uri`. A uri given
 * twice is one box. Pure and synchronous: the same files give the same graph, ids and order
 * included, so a widget keeps its selection and its expanded boxes across a rebuild.
 */
export declare function buildRelationshipGraph(files: readonly RawSource[]): RelationshipGraph;
