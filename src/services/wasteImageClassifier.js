const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const THRESHOLDS_PATH = path.join(__dirname, '..', '..', 'config', 'ai-thresholds.json');

const WASTE_TYPES = ['ขยะทั่วไป', 'ขยะรีไซเคิล', 'ขยะอินทรีย์', 'ขยะอันตราย'];
const UNCLASSIFIED = 'unclassified';

const client = new Anthropic();

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    waste_type: {
      anyOf: [{ type: 'string', enum: WASTE_TYPES }, { type: 'null' }],
      description: 'ประเภทขยะที่พบในภาพ หรือ null หากไม่สามารถระบุได้',
    },
    coverage_percentage: {
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description: 'สัดส่วนพื้นที่ถัง/บริเวณในภาพที่ถูกขยะปกคลุม เป็นตัวเลข 0-100 หรือ null หากประเมินไม่ได้',
    },
    no_waste_detected: {
      type: 'boolean',
      description: 'true หากไม่พบขยะในภาพเลย',
    },
  },
  required: ['waste_type', 'coverage_percentage', 'no_waste_detected'],
  additionalProperties: false,
};

function readThresholds() {
  const raw = fs.readFileSync(THRESHOLDS_PATH, 'utf8');
  return JSON.parse(raw);
}

function deriveUrgency(coveragePercentage) {
  if (typeof coveragePercentage !== 'number' || Number.isNaN(coveragePercentage)) {
    return UNCLASSIFIED;
  }
  const { urgentMinPercent, actionNeededMinPercent } = readThresholds();
  if (coveragePercentage >= urgentMinPercent) return 'เร่งด่วน';
  if (coveragePercentage >= actionNeededMinPercent) return 'ควรดำเนินการ';
  return 'ไม่เร่งด่วน';
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} mediaType e.g. "image/jpeg"
 * @returns {Promise<{wasteType: string, urgency: string, coveragePercentage: number|null, noWasteDetected: boolean}>}
 */
async function classifyWasteImage(imageBuffer, mediaType) {
  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: RESULT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBuffer.toString('base64') },
            },
            {
              type: 'text',
              text:
                'วิเคราะห์ภาพนี้เพื่อช่วยงานเก็บขยะในมหาวิทยาลัย: ' +
                '1) จำแนกประเภทขยะหลักที่เห็นในภาพ ' +
                '2) ประเมินสัดส่วนพื้นที่ถัง/บริเวณในภาพที่ถูกขยะปกคลุมเป็นเปอร์เซ็นต์ (0-100) ' +
                '3) ระบุว่าพบขยะในภาพหรือไม่',
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return { wasteType: UNCLASSIFIED, urgency: UNCLASSIFIED, coveragePercentage: null, noWasteDetected: false };
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) {
      return { wasteType: UNCLASSIFIED, urgency: UNCLASSIFIED, coveragePercentage: null, noWasteDetected: false };
    }

    const parsed = JSON.parse(textBlock.text);
    const wasteType = parsed.waste_type && WASTE_TYPES.includes(parsed.waste_type) ? parsed.waste_type : UNCLASSIFIED;
    const coveragePercentage =
      typeof parsed.coverage_percentage === 'number' ? Math.min(100, Math.max(0, parsed.coverage_percentage)) : null;

    return {
      wasteType,
      urgency: parsed.no_waste_detected ? UNCLASSIFIED : deriveUrgency(coveragePercentage),
      coveragePercentage,
      noWasteDetected: Boolean(parsed.no_waste_detected),
    };
  } catch (err) {
    return { wasteType: UNCLASSIFIED, urgency: UNCLASSIFIED, coveragePercentage: null, noWasteDetected: false, error: err.message };
  }
}

module.exports = { classifyWasteImage, WASTE_TYPES, UNCLASSIFIED };
