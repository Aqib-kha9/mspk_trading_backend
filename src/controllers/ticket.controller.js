import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import Ticket from '../models/Ticket.js';
import ApiError from '../utils/ApiError.js';

const createTicket = catchAsync(async (req, res) => {
  const { subject, category, message, priority } = req.body;
  
  // Generate a simple Ticket ID (e.g., TKT-Timestamp)
  // In production, use a counter or more robust ID generation
  const ticketId = `TKT-${Date.now()}`;

  const ticket = await Ticket.create({
    ticketId,
    user: req.user.id,
    subject,
    category,
    priority,
    messages: [{
      sender: 'USER',
      message: message
    }]
  });

  res.status(httpStatus.CREATED).send(ticket);
});

const getTickets = catchAsync(async (req, res) => {
  // Return all tickets for Admin/Support Dashboard view
  // Pagination can be added later if needed
  // Filter by user unless admin
  const filter = req.user.role === 'admin' ? {} : { user: req.user.id };
  const tickets = await Ticket.find(filter).sort({ createdAt: -1 }).populate('user', 'name email');
  res.send(tickets);
});

const getTicketById = catchAsync(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id).populate('user', 'name email');
  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ticket not found');
  }
  
  // Ensure user can only see their own ticket (unless admin)
  if (req.user.role !== 'admin' && ticket.user._id.toString() !== req.user.id) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden');
  }

  res.send(ticket);
});

const replyToTicket = catchAsync(async (req, res) => {
  const { message } = req.body;
  const ticket = await Ticket.findById(req.params.id);
  
  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ticket not found');
  }

  // Ensure user owns ticket (unless admin)
  if (req.user.role !== 'admin' && ticket.user.toString() !== req.user.id) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden');
  }

  const sender = req.user.role === 'admin' ? 'ADMIN' : 'USER';
  
  ticket.messages.push({
    sender,
    message
  });
  
  // If Admin replies, maybe update status to IN_PROGRESS or RESOLVED?
  // If User replies, maybe set back to OPEN?
  // For now, let's keep it simple.
  
  await ticket.save();
  res.send(ticket);
});

const updateTicket = catchAsync(async (req, res) => {
   const { status, priority } = req.body;
   const ticket = await Ticket.findById(req.params.id);
   
   if (!ticket) {
     throw new ApiError(httpStatus.NOT_FOUND, 'Ticket not found');
   }
   
   if (status) ticket.status = status;
   if (priority) ticket.priority = priority;

   await ticket.save();
   res.send(ticket);
});

const editMessage = catchAsync(async (req, res) => {
  const { message } = req.body;
  const ticket = await Ticket.findOne({ _id: req.params.id, 'messages._id': req.params.messageId });

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ticket or Message not found');
  }

  const msg = ticket.messages.id(req.params.messageId);

  // Authorization: Strict - Only sender can edit/delete
  const isOwner = (req.user.role === 'admin' && msg.sender === 'ADMIN') || 
                  (req.user.role !== 'admin' && msg.sender === 'USER');

  if (!isOwner) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You can only edit your own messages');
  }

  msg.message = message;
  msg.updatedAt = Date.now(); // Optional: track edits
  
  await ticket.save();
  res.send(ticket);
});

const deleteMessage = catchAsync(async (req, res) => {
  const ticket = await Ticket.findOne({ _id: req.params.id, 'messages._id': req.params.messageId });

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ticket or Message not found');
  }

  const msg = ticket.messages.id(req.params.messageId);

  // Authorization: Strict - Only sender can edit/delete
  // Admin -> 'ADMIN', User -> 'USER'
  const isOwner = (req.user.role === 'admin' && msg.sender === 'ADMIN') || 
                  (req.user.role !== 'admin' && msg.sender === 'USER');

  if (!isOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You can only modify your own messages');
  }

  // Use pull to remove the subdocument
  ticket.messages.pull(req.params.messageId);
  
  await ticket.save();
  res.send(ticket);
});

export default {
  createTicket,
  getTickets,
  getTicketById,
  replyToTicket,
  updateTicket,
  editMessage,
  deleteMessage
};
