import * as d3 from 'd3';

import {
  Renderer,
  RendererOptions,
  TreeEntry,
  TreeNode,
  TreeNodeSelection,
} from './api';
import { FamDetails, IndiDetails } from './data';
import { formatDate } from './date-format';
import {
  CompositeRenderer,
  getFamPositionHorizontal,
  getFamPositionVertical,
} from './composite-renderer';
import { getLength } from './detailed-renderer';

const INDI_MIN_HEIGHT = 43;
const INDI_MIN_WIDTH = 64;
const FAM_MIN_HEIGHT = 10;
const FAM_MIN_WIDTH = 15;
const IMAGE_WIDTH = 70;
/** Minimum box height when an image is present. */
const IMAGE_HEIGHT = 90;

const ANIMATION_DELAY_MS = 200;
const ANIMATION_DURATION_MS = 500;

const SEX_COLORS: Map<string, string> = new Map([
  ['F', '#fcb7bd'],
  ['M', '#b1e2e2'],
]);

interface DetailsLine {
  symbol: string;
  centered: boolean;
  text: string;
}

interface OffsetIndi {
  indi: TreeEntry;
  generation: number;
  xOffset: number;
  yOffset: number;
}

/**
 * Renders simple details about a person, colored by their sex.
 */
export class ColorfulRenderer extends CompositeRenderer implements Renderer {
  constructor(readonly options: RendererOptions<IndiDetails, FamDetails>) {
    super(options);
  }

  /** Extracts lines of details for a person. */
  private getIndiDetails(indi: IndiDetails): DetailsLine[] {
    const detailsList: DetailsLine[] = [];

    const birthDate = indi.getBirthDate();
    const deathDate = indi.getDeathDate();
    const isValidBirthDate = birthDate && (birthDate.date || birthDate.dateRange);
    const isValidDeathDate = deathDate && (deathDate.date || deathDate.dateRange);
    if (isValidBirthDate || isValidDeathDate) {
      let lifespan: string = '';

      if (isValidBirthDate) {
        if (birthDate!.date) {
          lifespan += birthDate!.date!.year;
        } else {
          lifespan += birthDate!.dateRange!.from!.year;
        }
      } else {
        lifespan += '?';
      }

      lifespan += ' - ';

      if (isValidDeathDate) {
        if (deathDate!.date) {
          lifespan += deathDate!.date!.year;
        } else {
          lifespan += deathDate!.dateRange!.to!.year;
        }
      }

      detailsList.push({ symbol: '', centered: true, text: lifespan });
    }

    const birthPlace = indi.getBirthPlace();
    const deathPlace = indi.getDeathPlace();
    if (birthPlace) {
      detailsList.push({ symbol: '', centered: true, text: birthPlace });
    } else if (deathPlace) {
      detailsList.push({ symbol: '', centered: true, text: deathPlace });
    }
    return detailsList;
  }

  /** Extracts lines of details for a family. */
  private getFamDetails(fam: FamDetails): DetailsLine[] {
    const detailsList: DetailsLine[] = [];
    const marriageDate =
      fam.getMarriageDate() &&
      fam.getMarriageDate()!.date &&
      formatDate(fam.getMarriageDate()!.date!, this.options.locale);
    const marriagePlace = fam.getMarriagePlace();
    if (marriageDate) {
      detailsList.push({ symbol: '', centered: false, text: marriageDate });
    }
    if (marriagePlace) {
      detailsList.push({ symbol: '', centered: false, text: marriagePlace });
    }
    if (marriageDate || marriagePlace) {
      detailsList[0].symbol = '\u26AD';
    }
    return detailsList;
  }

  getPreferredIndiSize(id: string): [number, number] {
    const indi = this.options.data.getIndi(id)!;
    const details = this.getIndiDetails(indi);

    const height = d3.max([
      INDI_MIN_HEIGHT + details.length * 14,
      indi.getImageUrl() ? IMAGE_HEIGHT : 0,
    ])!;

    const maxDetailsWidth = d3.max(
      details.map(x => getLength(x.text, 'details'))
    )!;
    const width =
      d3.max([
        maxDetailsWidth + 22,
        getLength(indi.getFirstName() || '', 'name') + 8,
        getLength(indi.getLastName() || '', 'name') + 8,
        INDI_MIN_WIDTH,
      ])! + (indi.getImageUrl() ? IMAGE_WIDTH : 0);
    return [width, height];
  }

  getPreferredFamSize(id: string): [number, number] {
    const fam = this.options.data.getFam(id)!;
    const details = this.getFamDetails(fam);

    const height = d3.max([10 + details.length * 14, FAM_MIN_HEIGHT])!;
    const maxDetailsWidth = d3.max(
      details.map(x => getLength(x.text, 'details'))
    )!;
    const width = d3.max([maxDetailsWidth + 22, FAM_MIN_WIDTH])!;
    return [width, height];
  }

  render(enter: TreeNodeSelection, update: TreeNodeSelection): void {
    enter = enter.append('g').attr('class', 'detailed');
    update = update.select('g');

    const indiUpdate = enter
      .merge(update)
      .selectAll('g.indi')
      .data(
        node => {
          const result: OffsetIndi[] = [];
          const famXOffset =
            !this.options.horizontal && node.data.family
              ? d3.max([-getFamPositionVertical(node.data), 0])!
              : 0;
          const famYOffset =
            this.options.horizontal && node.data.family
              ? d3.max([-getFamPositionHorizontal(node.data), 0])!
              : 0;
          if (node.data.indi) {
            result.push({
              indi: node.data.indi,
              generation: node.data.generation!,
              xOffset: famXOffset,
              yOffset: 0,
            });
          }
          if (node.data.spouse) {
            result.push({
              indi: node.data.spouse,
              generation: node.data.generation!,
              xOffset:
                !this.options.horizontal && node.data.indi
                  ? node.data.indi.width! + famXOffset
                  : 0,
              yOffset:
                this.options.horizontal && node.data.indi
                  ? node.data.indi.height! + famYOffset
                  : 0,
            });
          }
          return result;
        },
        (data: OffsetIndi) => data.indi.id
      );

    const indiEnter = indiUpdate
      .enter()
      .append('g' as string)
      .attr('class', 'indi');
    this.transition(indiEnter.merge(indiUpdate)).attr(
      'transform',
      node => `translate(${node.xOffset}, ${node.yOffset})`
    );

    this.renderIndi(indiEnter, indiUpdate);

    const familyEnter = enter
      .select(function(node) {
        return node.data.family ? this : null;
      })
      .append('g' as string)
      .attr('class', 'family');
    const familyUpdate = update
      .select(function(node) {
        return node.data.family ? this : null;
      })
      .select('g.family');

    this.transition(familyEnter.merge(familyUpdate)).attr('transform', node =>
      this.getFamTransform(node.data)
    );
    this.renderFamily(familyEnter, familyUpdate);
  }

  getCss() {
    return `
.detailed text {
  font-family: "Roboto Slab", arial, sans-serif;
  font-size: 12px;
}

.detailed .name {
  font-weight: bold;
}

.link {
  fill: none;
  stroke: #000;
  stroke-width: 1px;
}

.additional-marriage {
  stroke-dasharray: 2;
}

.detailed rect {
  stroke: white;
}

.detailed {
  stroke-width: 2px;
}

.detailed .details {
  font-size: 10px;
}

.detailed .id {
  font-size: 10px;
  font-style: italic;
}

.detailed rect {
  fill: #d3d3d3;
}

/*.generation-11 .detailed rect, .generation1 .detailed rect {
  fill: #edffdb;
}

.generation-10 .detailed rect, .generation2 .detailed rect {
  fill: #dbffdb;
}

.generation-9 .detailed rect, .generation3 .detailed rect {
  fill: #dbffed;
}

.generation-8 .detailed rect, .generation4 .detailed rect {
  fill: #dbffff;
}

.generation-7 .detailed rect, .generation5 .detailed rect {
  fill: #dbedff;
}

.generation-6 .detailed rect, .generation6 .detailed rect {
  fill: #dbdbff;
}

.generation-5 .detailed rect, .generation7 .detailed rect {
  fill: #eddbff;
}

.generation-4 .detailed rect, .generation8 .detailed rect {
  fill: #ffdbff;
}

.generation-3 .detailed rect, .generation9 .detailed rect {
  fill: #ffdbed;
}

.generation-2 .detailed rect, .generation10 .detailed rect {
  fill: #ffdbdb;
}

.generation-1 .detailed rect, .generation11 .detailed rect {
  fill: #ffeddb;
}*/`;
  }

  private transition<T>(
    selection: d3.Selection<d3.BaseType, T, d3.BaseType, {}>
  ) {
    return this.options.animate
      ? selection
          .transition()
          .delay(ANIMATION_DELAY_MS)
          .duration(ANIMATION_DURATION_MS)
      : selection;
  }

  private getFamTransform(node: TreeNode): string {
    if (this.options.horizontal) {
      return `translate(${(node.indi && node.indi.width) ||
        node.spouse!.width}, ${d3.max([getFamPositionHorizontal(node), 0])})`;
    }
    return `translate(${d3.max([
      getFamPositionVertical(node),
      0,
    ])}, ${(node.indi && node.indi.height) || node.spouse!.height})`;
  }

  private renderIndi(
    enter: d3.Selection<d3.BaseType, OffsetIndi, d3.BaseType, {}>,
    update: d3.Selection<d3.BaseType, OffsetIndi, d3.BaseType, {}>
  ) {
    if (this.options.indiHrefFunc) {
      enter = enter
        .append('a')
        .attr('href', data => this.options.indiHrefFunc!(data.indi.id));
      update = update.select('a');
    }
    if (this.options.indiCallback) {
      enter.on('click', data =>
        this.options.indiCallback!({
          id: data.indi.id,
          generation: data.generation,
        })
      );
    }

    const getIndi = (data: OffsetIndi) =>
      this.options.data.getIndi(data.indi.id);

    const getDetailsWidth = (data: OffsetIndi) =>
      data.indi.width! - (getIndi(data)!.getImageUrl() ? IMAGE_WIDTH : 0);

    // Background.
    const background = enter
      .append('rect')
      .attr('rx', 5)
      .attr('stroke-width', 0)
      .attr('class', 'background')
      .attr('style', data => 'fill: ' + SEX_COLORS.get(getIndi(data)!.getSex() || '') || '')
      .merge(update.select('rect.background'));
    this.transition(background)
      .attr('width', node => node.indi.width!)
      .attr('height', node => node.indi.height!);

    // Clip path.
    const getClipId = (id: string) => `clip-${id}`;
    enter
      .append('clipPath')
      .attr('id', node => getClipId(node.indi.id))
      .append('rect')
      .attr('rx', 5)
      .merge(update.select('clipPath rect'))
      .attr('width', node => node.indi.width!)
      .attr('height', node => node.indi.height!);

    // Name.
    enter
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('class', 'name')
      .attr('transform', node => `translate(${getDetailsWidth(node) / 2}, 17)`)
      .text(node => getIndi(node)!.getFirstName());
    enter
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('class', 'name')
      .attr('transform', node => `translate(${getDetailsWidth(node) / 2}, 33)`)
      .text(node => getIndi(node)!.getLastName());

    // Extract details.
    const details = new Map<string, DetailsLine[]>();
    enter.each(node => {
      const indi = getIndi(node)!;
      const detailsList = this.getIndiDetails(indi);
      details.set(node.indi.id, detailsList);
    });

    const maxDetails = d3.max(Array.from(details.values(), v => v.length))!;

    // Render details.
    for (let i = 0; i < maxDetails; ++i) {
      const lineGroup = enter.filter(
        data => details.get(data.indi.id)!.length > i
      );

      const centered = lineGroup.filter(data => details.get(data.indi.id)![i].centered);
      centered
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('class', 'details')
        .attr('transform', node => `translate(${getDetailsWidth(node) / 2}, ${49 + i * 14})`)
        .text(data => details.get(data.indi.id)![i].text);

      const nonCentered = lineGroup.filter(data => !details.get(data.indi.id)![i].centered);
      nonCentered
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('class', 'details symbol')
        .attr('transform', `translate(9, ${49 + i * 14})`)
        .text(data => details.get(data.indi.id)![i].symbol);
      nonCentered
        .append('text')
        .attr('class', 'details')
        .attr('transform', `translate(15, ${49 + i * 14})`)
        .text(data => details.get(data.indi.id)![i].text);
    }

    // Image.
    enter
      .filter(data => !!getIndi(data)!.getImageUrl())
      .append('image')
      .attr('width', IMAGE_WIDTH)
      .attr('height', data => data.indi.height!)
      .attr('preserveAspectRatio', 'xMidYMin')
      .attr(
        'transform',
        data => `translate(${data.indi.width! - IMAGE_WIDTH}, 0)`
      )
      .attr('clip-path', data => `url(#${getClipId(data.indi.id)})`)
      .attr('href', data => getIndi(data)!.getImageUrl());

    // Border on top.
    const border = enter
      .append('rect')
      .attr('rx', 5)
      .attr('fill-opacity', 0)
      .attr('class', 'border')
      .merge(update.select('rect.border'));
    this.transition(border)
      .attr('width', data => data.indi.width!)
      .attr('height', data => data.indi.height!);
  }

  private renderFamily(enter: TreeNodeSelection, update: TreeNodeSelection) {
    if (this.options.famHrefFunc) {
      enter = enter
        .append('a')
        .attr('href', node => this.options.famHrefFunc!(node.data.family!.id));
    }
    if (this.options.famCallback) {
      enter.on('click', node =>
        this.options.famCallback!({
          id: node.data.family!.id,
          generation: node.data.generation!,
        })
      );
    }

    // Box.
    enter
      .append('rect')
      .attr('rx', 5)
      .attr('ry', 5)
      .attr('width', node => node.data.family!.width!)
      .attr('height', node => node.data.family!.height!);

    // Extract details.
    const details = new Map<string, DetailsLine[]>();
    enter.each(node => {
      const famId = node.data.family!.id;
      const fam = this.options.data.getFam(famId)!;
      const detailsList = this.getFamDetails(fam);
      details.set(famId, detailsList);
    });
    const maxDetails = d3.max(Array.from(details.values(), v => v.length))!;

    // Render details.
    for (let i = 0; i < maxDetails; ++i) {
      const lineGroup = enter.filter(
        node => details.get(node.data.family!.id)!.length > i
      );
      lineGroup
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('class', 'details')
        .attr('transform', `translate(9, ${16 + i * 14})`)
        .text(node => details.get(node.data.family!.id)![i].symbol);
      lineGroup
        .append('text')
        .attr('text-anchor', 'start')
        .attr('class', 'details')
        .attr('transform', `translate(15, ${16 + i * 14})`)
        .text(node => details.get(node.data.family!.id)![i].text);
    }
  }
}
